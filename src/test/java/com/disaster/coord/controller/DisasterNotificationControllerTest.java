package com.disaster.coord.controller;

import com.disaster.coord.dto.DisasterNotificationRequest;
import com.disaster.coord.dto.DisasterNotificationResult;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.service.DisasterNotificationService;
import com.disaster.coord.service.FcmNotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DisasterNotificationController.class)
@AutoConfigureMockMvc(addFilters = false)
@DisplayName("Disaster Notification REST Controller Tests")
class DisasterNotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private DisasterNotificationService notificationService;

    @MockBean
    private FcmNotificationService fcmNotificationService;

    @Test
    @DisplayName("POST /api/disasters/notify should return 200 OK with notification results")
    void testTriggerNotifications_ReturnsOk() throws Exception {
        DisasterNotificationRequest request = DisasterNotificationRequest.builder()
                .disasterId(10L)
                .latitude(13.0827)
                .longitude(80.2707)
                .type(DisasterType.FLOOD)
                .title("Severe Inundation")
                .radiusKm(30.0)
                .build();

        DisasterNotificationResult mockResult = DisasterNotificationResult.builder()
                .disasterId(10L)
                .disasterType("FLOOD")
                .latitude(13.0827)
                .longitude(80.2707)
                .resolvedAddress("Poonamallee High Rd, Chennai")
                .candidateUsersInBoundingBox(12)
                .usersWithinRadius(8)
                .notificationsSent(8)
                .radiusKm(30.0)
                .executionDurationMs(45)
                .recipients(Collections.emptyList())
                .build();

        when(notificationService.processDisasterNotification(
                eq(10L), eq(13.0827), eq(80.2707), eq(DisasterType.FLOOD), eq("Severe Inundation"), eq(30.0)))
                .thenReturn(mockResult);

        long start = System.currentTimeMillis();

        mockMvc.perform(post("/api/disasters/notify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.disasterId").value(10))
                .andExpect(jsonPath("$.data.disasterType").value("FLOOD"))
                .andExpect(jsonPath("$.data.resolvedAddress").value("Poonamallee High Rd, Chennai"))
                .andExpect(jsonPath("$.data.usersWithinRadius").value(8))
                .andExpect(jsonPath("$.data.notificationsSent").value(8));

        long duration = System.currentTimeMillis() - start;
        // Verify response time SLA < 2 seconds
        org.junit.jupiter.api.Assertions.assertTrue(duration < 2000,
                "API response time must be under 2000ms SLA, was: " + duration + "ms");
    }

    @Test
    @DisplayName("POST /api/disasters/notify-async should return 202 ACCEPTED in milliseconds")
    void testTriggerNotificationsAsync_ReturnsAccepted() throws Exception {
        DisasterNotificationRequest request = DisasterNotificationRequest.builder()
                .disasterId(12L)
                .latitude(13.0827)
                .longitude(80.2707)
                .type(DisasterType.CYCLONE)
                .build();

        mockMvc.perform(post("/api/disasters/notify-async")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value("ACCEPTED"));
    }

    @Test
    @DisplayName("GET /api/disasters/notifications/dispatched should return 200 OK")
    void testGetDispatchedNotifications_ReturnsOk() throws Exception {
        when(fcmNotificationService.getDispatchedNotifications()).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/disasters/notifications/dispatched"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }
}
