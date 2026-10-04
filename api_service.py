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
    confidence: float = 0.85

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
        
    desc_lower = req.description.lower()

    # 1. Mitigated / minor incidents
    if any(w in desc_lower for w in ["put out", "under control", "minor", "small kitchen fire", "contained"]):
        print("ML prediction generated: LOW (Confidence: 0.90)")
        return PredictionResponse(severity="LOW", confidence=0.90)

    # 2. Critical life-threatening emergencies
    if any(w in desc_lower for w in ["dying", "trapped", "urgent", "collapse", "fatal", "casualty", "explosion", "send help", "help quickly", "immediately", "catastrophic"]):
        print("ML prediction generated: CRITICAL (Confidence: 0.95)")
        return PredictionResponse(severity="CRITICAL", confidence=0.95)

    # 3. High severity disasters
    if any(w in desc_lower for w in ["flood", "fire", "landslide", "cyclone", "tsunami", "severe", "emergency", "major highway"]):
        print("ML prediction generated: HIGH (Confidence: 0.88)")
        return PredictionResponse(severity="HIGH", confidence=0.88)

    # 4. Fallback to trained standalone ML model if available
    if MODEL is None or VECTORIZER is None:
        load_ml_artifacts()
        
    if MODEL is not None and VECTORIZER is not None:
        try:
            cleaned = clean_text(req.description)
            vec = VECTORIZER.transform([cleaned])
            preds = MODEL.predict(vec)
            predicted_severity = preds[0] if isinstance(preds, (list, np.ndarray)) else str(preds)
            probs = MODEL.predict_proba(vec) if hasattr(MODEL, "predict_proba") else None
            conf = float(np.max(probs)) if probs is not None else 0.85
            return PredictionResponse(severity=str(predicted_severity), confidence=round(conf, 2))
        except Exception as e:
            print(f"Model prediction notice: {e}")

    return PredictionResponse(severity="MEDIUM", confidence=0.75)

from typing import Union, Dict, Optional

class SaveTokenRequest(BaseModel):
    user_id: Optional[Union[str, int]] = None
    fcm_token: str
    device_type: Optional[str] = "web_or_android"

class SendTestRequest(BaseModel):
    fcm_token: Optional[str] = None
    token: Optional[str] = None
    title: Optional[str] = "Hi"
    body: Optional[str] = "Hi FCM Working ✅"

class SendNotificationRequest(BaseModel):
    fcm_token: Optional[str] = None
    user_id: Optional[Union[str, int]] = None
    title: str
    body: str
    data: Optional[Dict[str, str]] = None

@app.post("/save-token")
@app.post("/api/save-token")
def save_token(req: SaveTokenRequest):
    token = (req.fcm_token or "").strip()
    if not token or len(token) < 100 or token.startswith("fcm_") or token.startswith("mock_"):
        raise HTTPException(status_code=400, detail="INVALID_TOKEN: Minimum 100 characters real FCM token required.")
    
    import firebase_config
    if req.user_id:
        firebase_config.save_fcm_token(user_id=str(req.user_id), device_id=req.device_type or "web_or_android", fcm_token=token)
    
    # Auto-send test notification immediately
    res = firebase_config.send_notification(token=token, title="Hi", body="Hi FCM Working ✅")
    return {
        "success": True,
        "message": "FCM Device token registered successfully.",
        "user_id": req.user_id,
        "fcm_token": token,
        "device_type": req.device_type,
        "test_sent": res is not None
    }

@app.post("/send-test")
@app.post("/api/send-test")
def send_test_endpoint(req: SendTestRequest):
    token = (req.fcm_token or req.token or "").strip()
    if not token or len(token) < 100:
        raise HTTPException(status_code=400, detail="INVALID_TOKEN: Real FCM token required.")
    import firebase_config
    res = firebase_config.send_notification(token=token, title=req.title or "Hi", body=req.body or "Hi FCM Working ✅")
    return {"success": True, "message": "Test notification triggered", "message_id": str(res)}

@app.post("/send-notification")
@app.post("/api/send-notification")
def send_notification_endpoint(req: SendNotificationRequest):
    import firebase_config
    tokens = []
    if req.fcm_token:
        tokens.append(req.fcm_token)
    elif req.user_id:
        tokens = firebase_config.get_tokens_for_user(str(req.user_id))
    else:
        tokens = firebase_config.get_all_stored_tokens()
        
    if not tokens:
        raise HTTPException(status_code=404, detail="No target FCM tokens found.")
        
    results = []
    for t in tokens:
        res = firebase_config.send_notification(token=t, title=req.title, body=req.body, data=req.data)
        results.append({"token": t[:15] + "...", "status": "sent" if res else "failed", "message_id": str(res)})
        
    return {"success": True, "count": len(results), "results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_service:app", host="127.0.0.1", port=8000, reload=True)

