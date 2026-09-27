import os
import re
import sys
import pickle
import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np

# Import classes from python_ml_standalone
import python_ml_standalone
from python_ml_standalone import StandaloneTfidfVectorizer, StandaloneClassifier, clean_text

# Bind class references to __main__ so pickle finds them regardless of entrypoint
main_mod = sys.modules.get('__main__')
if main_mod is not None:
    setattr(main_mod, 'StandaloneTfidfVectorizer', StandaloneTfidfVectorizer)
    setattr(main_mod, 'StandaloneClassifier', StandaloneClassifier)

app = FastAPI(
    title="Disaster Severity Prediction API",
    description="Automated ML service for categorizing disaster incident descriptions into severity levels.",
    version="1.0.0"
)

MODEL = None
VECTORIZER = None

class PredictionRequest(BaseModel):
    description: str

class PredictionResponse(BaseModel):
    severity: str

def load_ml_artifacts():
    global MODEL, VECTORIZER
    model_path = os.path.join(os.path.dirname(__file__), "model.pkl")
    vec_path = os.path.join(os.path.dirname(__file__), "vectorizer.pkl")
    
    if os.path.exists(model_path) and os.path.exists(vec_path):
        try:
            MODEL = joblib.load(model_path)
        except Exception:
            with open(model_path, "rb") as f:
                MODEL = pickle.load(f)

        try:
            VECTORIZER = joblib.load(vec_path)
        except Exception:
            with open(vec_path, "rb") as f:
                VECTORIZER = pickle.load(f)
                
        print("Successfully loaded model.pkl and vectorizer.pkl")
    else:
        print("Warning: model.pkl or vectorizer.pkl missing.")

@app.on_event("startup")
def startup_event():
    load_ml_artifacts()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Disaster Severity Prediction API",
        "model_loaded": MODEL is not None
    }

@app.post("/predict", response_model=PredictionResponse)
def predict_severity(req: PredictionRequest):
    if not req.description or len(req.description.strip()) == 0:
        raise HTTPException(status_code=400, detail="Description text cannot be empty.")
        
    if MODEL is None or VECTORIZER is None:
        load_ml_artifacts()
        if MODEL is None or VECTORIZER is None:
            raise HTTPException(status_code=500, detail="ML model artifacts not loaded on server.")
            
    cleaned = clean_text(req.description)
    vec = VECTORIZER.transform([cleaned])
    preds = MODEL.predict(vec)
    predicted_severity = preds[0] if isinstance(preds, (list, np.ndarray)) else str(preds)
    
    return PredictionResponse(severity=str(predicted_severity))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_service:app", host="127.0.0.1", port=8000, reload=True)
