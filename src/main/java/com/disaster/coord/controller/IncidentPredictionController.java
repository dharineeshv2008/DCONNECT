package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.PredictionDtos.PredictionRequest;
import com.disaster.coord.dto.PredictionDtos.PredictionResponse;
import com.disaster.coord.service.IncidentPredictionService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Controller exposing REST endpoints for Incident Severity Prediction.
 * Directly replaces legacy local python ML endpoints (/predict & /api/predict).
 */
@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class IncidentPredictionController {

    private static final Logger log = LoggerFactory.getLogger(IncidentPredictionController.class);

    private final IncidentPredictionService predictionService;

    @PostMapping({"/predict", "/api/predict"})
    public ResponseEntity<PredictionResponse> predictSeverity(@RequestBody PredictionRequest request) {
        log.info("Received severity prediction request: desc='{}', type={}, title={}",
                request.getDescription() != null ? request.getDescription().substring(0, Math.min(40, request.getDescription().length())) : "null",
                request.getType(), request.getTitle());

        PredictionResponse response = predictionService.predict(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping({"/predict/status", "/api/predict/status"})
    public ResponseEntity<ApiResponse<Map<String, Object>>> getServiceStatus() {
        return ResponseEntity.ok(ApiResponse.ok("Prediction service status", Map.of(
                "service", "Hugging Face Incident Severity Prediction API",
                "status", "ACTIVE",
                "engine", "HuggingFace Router (Qwen/Qwen2.5-7B-Instruct)"
        )));
    }
}
