package com.disaster.coord.service;

import com.disaster.coord.client.HuggingFaceInferenceClient;
import com.disaster.coord.dto.PredictionDtos.*;
import com.disaster.coord.entity.Disaster;
import com.disaster.coord.entity.IncidentPrediction;
import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Severity;
import com.disaster.coord.repository.IncidentPredictionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Incident Prediction Service Unit Tests")
class IncidentPredictionServiceTest {

    @Mock
    private HuggingFaceInferenceClient huggingFaceClient;

    @Mock
    private IncidentPredictionRepository predictionRepository;

    @InjectMocks
    private IncidentPredictionService predictionService;

    @BeforeEach
    void setUp() {
        when(huggingFaceClient.getModelId()).thenReturn("Qwen/Qwen2.5-7B-Instruct");
    }

    @Test
    @DisplayName("Should return SUCCESS assessment and persist audit record when API succeeds")
    void testSuccessfulPrediction() {
        when(huggingFaceClient.isConfigured()).thenReturn(true);
        when(huggingFaceClient.assessIncident(eq(DisasterType.FLOOD), anyString(), anyString()))
                .thenReturn(StructuredSeverityAssessment.builder()
                        .severity("HIGH")
                        .reason("Severe flooding of residential neighborhoods.")
                        .evidence("submerged homes")
                        .build());

        PredictionRequest request = PredictionRequest.builder()
                .disasterId(42L)
                .type(DisasterType.FLOOD)
                .title("Flash flood downtown")
                .description("Floodwaters submerged homes along the riverbanks.")
                .build();

        PredictionResponse response = predictionService.predict(request);

        assertNotNull(response);
        assertEquals("HIGH", response.getSeverity());
        assertEquals("SUCCESS", response.getStatus());
        assertEquals("huggingface_router", response.getSource());
        assertTrue(response.getReason().contains("Severe flooding"));
        verify(predictionRepository, times(1)).save(any(IncidentPrediction.class));
    }

    @Test
    @DisplayName("Should return PENDING status when HF_TOKEN is not configured")
    void testUnconfiguredTokenReturnsPending() {
        when(huggingFaceClient.isConfigured()).thenReturn(false);

        PredictionRequest request = PredictionRequest.builder()
                .disasterId(10L)
                .type(DisasterType.FIRE)
                .title("Small smoke")
                .description("Smoke observed near park")
                .build();

        PredictionResponse response = predictionService.predict(request);

        assertNotNull(response);
        assertEquals("PENDING", response.getStatus());
        assertEquals("MEDIUM", response.getSeverity());
        verify(huggingFaceClient, never()).assessIncident(any(), any(), any());
        verify(predictionRepository, times(1)).save(any(IncidentPrediction.class));
    }

    @Test
    @DisplayName("Should return FAILED status and default safely to MEDIUM when API throws error")
    void testApiFailureReturnsFailedWithoutSilentLow() {
        when(huggingFaceClient.isConfigured()).thenReturn(true);
        when(huggingFaceClient.assessIncident(any(), any(), any()))
                .thenThrow(new RuntimeException("Rate limit 429 exceeded"));

        PredictionRequest request = PredictionRequest.builder()
                .disasterId(99L)
                .type(DisasterType.EARTHQUAKE)
                .title("Tremors felt")
                .description("Violent shaking in downtown high-rises.")
                .build();

        PredictionResponse response = predictionService.predict(request);

        assertNotNull(response);
        assertEquals("FAILED", response.getStatus());
        assertEquals("MEDIUM", response.getSeverity(), "Must not silently substitute LOW on API failure");
        assertTrue(response.getReason().contains("External ML service error"));
        verify(predictionRepository, times(1)).save(any(IncidentPrediction.class));
    }

    @Test
    @DisplayName("Should handle database persistence failures gracefully without crashing")
    void testDatabaseFailureDoesNotCrashFlow() {
        when(huggingFaceClient.isConfigured()).thenReturn(true);
        when(huggingFaceClient.assessIncident(any(), any(), any()))
                .thenReturn(StructuredSeverityAssessment.builder()
                        .severity("CRITICAL")
                        .reason("Active structural collapse")
                        .evidence("trapped")
                        .build());
        when(predictionRepository.save(any(IncidentPrediction.class)))
                .thenThrow(new RuntimeException("Database connection timed out"));

        PredictionRequest request = PredictionRequest.builder()
                .disasterId(101L)
                .type(DisasterType.BUILDING_COLLAPSE)
                .title("Mall collapsed")
                .description("People trapped inside")
                .build();

        // Must complete and return assessment without throwing
        PredictionResponse response = assertDoesNotThrow(() -> predictionService.predict(request));
        assertNotNull(response);
        assertEquals("CRITICAL", response.getSeverity());
    }

    @Test
    @DisplayName("Should predict for Disaster entity and link disaster ID")
    void testPredictForDisasterEntity() {
        when(huggingFaceClient.isConfigured()).thenReturn(true);
        when(huggingFaceClient.assessIncident(any(), any(), any()))
                .thenReturn(StructuredSeverityAssessment.builder()
                        .severity("LOW")
                        .reason("Controlled garden burn")
                        .evidence("safe")
                        .build());

        Disaster disaster = Disaster.builder()
                .id(77L)
                .type(DisasterType.FIRE)
                .title("Backyard smoke")
                .description("Controlled fire in backyard safely handled.")
                .status(DisasterStatus.PENDING)
                .severity(Severity.LOW)
                .build();

        PredictionResponse response = predictionService.predictForDisaster(disaster);

        assertNotNull(response);
        assertEquals("LOW", response.getSeverity());
        assertEquals("SUCCESS", response.getStatus());
        verify(predictionRepository, times(1)).save(argThat(pred -> Long.valueOf(77L).equals(pred.getDisasterId())));
    }
}
