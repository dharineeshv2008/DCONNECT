package com.disaster.coord.controller;

import com.disaster.coord.dto.PredictionDtos.PredictionRequest;
import com.disaster.coord.dto.PredictionDtos.PredictionResponse;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.service.IncidentPredictionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(IncidentPredictionController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Incident Prediction REST Controller Tests")
class IncidentPredictionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private IncidentPredictionService predictionService;

    @Test
    @DisplayName("POST /predict should return 200 OK with severity assessment JSON")
    void testPredictEndpoint() throws Exception {
        PredictionResponse mockResponse = PredictionResponse.builder()
                .severity("HIGH")
                .confidence(0.88)
                .reason("Major industrial wildfire threatening suburban residences.")
                .evidence("wildfire spreading to houses")
                .status("SUCCESS")
                .modelId("Qwen/Qwen2.5-7B-Instruct")
                .source("huggingface_router")
                .build();

        when(predictionService.predict(any(PredictionRequest.class))).thenReturn(mockResponse);

        PredictionRequest request = PredictionRequest.builder()
                .description("Major wildfire spreading towards residential area.")
                .type(DisasterType.FIRE)
                .title("Spreading Wildfire")
                .build();

        mockMvc.perform(post("/predict")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.severity").value("HIGH"))
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.reason").value("Major industrial wildfire threatening suburban residences."))
                .andExpect(jsonPath("$.modelId").value("Qwen/Qwen2.5-7B-Instruct"));
    }

    @Test
    @DisplayName("POST /api/predict should also return 200 OK for API prefix consumers")
    void testApiPredictEndpoint() throws Exception {
        PredictionResponse mockResponse = PredictionResponse.builder()
                .severity("CRITICAL")
                .confidence(0.95)
                .reason("Active structural collapse with people trapped.")
                .evidence("trapped under rubble")
                .status("SUCCESS")
                .modelId("Qwen/Qwen2.5-7B-Instruct")
                .source("huggingface_router")
                .build();

        when(predictionService.predict(any(PredictionRequest.class))).thenReturn(mockResponse);

        PredictionRequest request = PredictionRequest.builder()
                .description("Building collapsed with 20 people trapped.")
                .build();

        mockMvc.perform(post("/api/predict")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.severity").value("CRITICAL"))
                .andExpect(jsonPath("$.status").value("SUCCESS"));
    }

    @Test
    @DisplayName("GET /predict/status should return active status")
    void testGetStatus() throws Exception {
        mockMvc.perform(get("/predict/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
    }
}
