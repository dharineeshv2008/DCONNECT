package com.disaster.coord.service;

import com.disaster.coord.client.HuggingFaceInferenceClient;
import com.disaster.coord.dto.PredictionDtos.*;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.IncidentPrediction;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Severity;
import com.disaster.coord.repository.IncidentPredictionRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Enterprise Service for Disaster Incident Severity Prediction via Hugging Face.
 * Handles API orchestration, validation, bounded fallback, and Supabase audit persistence.
 */
@Service
@RequiredArgsConstructor
public class IncidentPredictionService {

    private static final Logger log = LoggerFactory.getLogger(IncidentPredictionService.class);

    private final HuggingFaceInferenceClient huggingFaceClient;
    private final IncidentPredictionRepository predictionRepository;

    /**
     * Predicts incident severity for incoming requests.
     * Preserves incident data and logs audit trail.
     */
    public PredictionResponse predict(PredictionRequest request) {
        String description = request.getDescription();
        DisasterType type = request.getType();
        String title = request.getTitle();
        Long disasterId = request.getDisasterId();

        if (description == null || description.trim().isEmpty()) {
            return PredictionResponse.fallback(
                    Severity.MEDIUM.name(),
                    "Empty description provided",
                    "Description text cannot be empty for severity prediction."
            );
        }

        // 1. Check if Hugging Face API is configured
        if (!huggingFaceClient.isConfigured()) {
            log.warn("Hugging Face API token (HF_TOKEN) not set. Marking prediction status PENDING.");
            PredictionResponse pendingResponse = PredictionResponse.builder()
                    .severity(Severity.MEDIUM.name())
                    .confidence(0.70)
                    .reason("HF_TOKEN not configured. Awaiting admin classification.")
                    .evidence("System configuration pending")
                    .status("PENDING")
                    .modelId(huggingFaceClient.getModelId())
                    .source("rule_engine_pending")
                    .build();

            saveAuditTrail(disasterId, pendingResponse, description);
            return pendingResponse;
        }

        // 2. Call external Hugging Face router inference
        try {
            StructuredSeverityAssessment assessment = huggingFaceClient.assessIncident(type, title, description);

            PredictionResponse response = PredictionResponse.builder()
                    .severity(assessment.getSeverity())
                    .confidence(0.88) // Uncalibrated score indicator for legacy consumers
                    .reason(assessment.getReason())
                    .evidence(assessment.getEvidence())
                    .status("SUCCESS")
                    .modelId(huggingFaceClient.getModelId())
                    .source("huggingface_router")
                    .build();

            saveAuditTrail(disasterId, response, description);
            return response;

        } catch (Exception ex) {
            log.error("Hugging Face inference failed for incident [disasterId={}]: {}", disasterId, ex.getMessage());

            // Failure handling: Never silently substitute LOW. Default safely to MEDIUM with FAILED status.
            PredictionResponse failedResponse = PredictionResponse.builder()
                    .severity(Severity.MEDIUM.name())
                    .confidence(0.70)
                    .reason("External ML service error: " + ex.getMessage())
                    .evidence("Awaiting manual admin review")
                    .status("FAILED")
                    .modelId(huggingFaceClient.getModelId())
                    .source("rule_engine_fallback")
                    .errorMessage(ex.getMessage())
                    .build();

            saveAuditTrail(disasterId, failedResponse, description);
            return failedResponse;
        }
    }

    /**
     * Executes prediction and links result to a newly created Disaster entity.
     */
    public PredictionResponse predictForDisaster(Disaster disaster) {
        if (disaster == null) return null;
        PredictionRequest req = PredictionRequest.builder()
                .disasterId(disaster.getId())
                .type(disaster.getType())
                .title(disaster.getTitle())
                .description(disaster.getDescription())
                .build();
        return predict(req);
    }

    /**
     * Persists prediction audit entry to Supabase PostgreSQL table (ml_predictions).
     * Uses REQUIRES_NEW to isolate audit record persistence from potential parent rollback.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveAuditTrail(Long disasterId, PredictionResponse response, String descriptionText) {
        try {
            IncidentPrediction predictionRecord = IncidentPrediction.builder()
                    .disasterId(disasterId)
                    .predictedSeverity(response.getSeverity())
                    .reason(response.getReason())
                    .evidence(response.getEvidence())
                    .modelVersion(response.getModelId() != null ? response.getModelId() : huggingFaceClient.getModelId())
                    .status(response.getStatus() != null ? response.getStatus() : "SUCCESS")
                    .descriptionText(descriptionText != null ? descriptionText.substring(0, Math.min(1000, descriptionText.length())) : null)
                    .build();

            predictionRepository.save(predictionRecord);
            log.debug("Persisted ML prediction audit record to Supabase [disasterId={}, severity={}, status={}]",
                    disasterId, response.getSeverity(), response.getStatus());
        } catch (Exception ex) {
            log.warn("Could not save ML prediction audit record to Supabase: {}", ex.getMessage());
        }
    }
}
