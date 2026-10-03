package com.disaster.coord.service;

import com.disaster.coord.dto.DisasterNotificationResult;
import com.disaster.coord.dto.FcmNotificationPayload;
import com.disaster.coord.entity.Notification;
import com.disaster.coord.entity.User;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.repository.DisasterRepository;
import com.disaster.coord.repository.NotificationRepository;
import com.disaster.coord.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Disaster Notification Service Unit Tests")
class DisasterNotificationServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private DisasterRepository disasterRepository;

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private ReverseGeocodingService reverseGeocodingService;

    @Mock
    private FcmNotificationService fcmNotificationService;

    @InjectMocks
    private DisasterNotificationService notificationService;

    private User nearbyUser1;
    private User nearbyUser2;
    private User edgeOutsideUser;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(notificationService, "configuredRadiusKm", 30.0);

        // Disaster origin: Chennai Central (13.0827, 80.2707)
        // User 1: Marina Beach (~3.8 km) - WITHIN 30 KM
        nearbyUser1 = User.builder()
                .id(101L)
                .name("Arun Kumar")
                .phone("9876543210")
                .role(Role.CITIZEN)
                .status(UserStatus.ACTIVE)
                .homeLat(13.0500)
                .homeLng(80.2824)
                .fcmToken("fcm_token_arun_101")
                .build();

        // User 2: Tambaram (~25.2 km) - WITHIN 30 KM
        nearbyUser2 = User.builder()
                .id(102L)
                .name("Priya Sharma")
                .phone("9876543211")
                .role(Role.CITIZEN)
                .status(UserStatus.ACTIVE)
                .homeLat(12.9249)
                .homeLng(80.1000)
                .fcmToken("fcm_token_priya_102")
                .build();

        // User 3: In the corner of the bounding box (~34 km) - OUTSIDE 30 KM
        edgeOutsideUser = User.builder()
                .id(103L)
                .name("Far Citizen")
                .phone("9876543212")
                .role(Role.CITIZEN)
                .status(UserStatus.ACTIVE)
                .homeLat(12.8500)
                .homeLng(80.0500)
                .fcmToken("fcm_token_far_103")
                .build();
    }

    @Test
    @DisplayName("Should fetch users via bounding box, filter <= 30km using Haversine, geocode once, and send FCM")
    void testProcessDisasterNotification_Success() {
        double disasterLat = 13.0827;
        double disasterLng = 80.2707;
        Long disasterId = 55L;
        DisasterType type = DisasterType.FLOOD;
        String address = "Poonamallee High Rd, Periamet, Chennai, Tamil Nadu 600003";

        // Mock Bounding Box query returning 3 candidates
        when(userRepository.findUsersInBoundingBox(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(Arrays.asList(nearbyUser1, nearbyUser2, edgeOutsideUser));

        // Mock Reverse Geocoding
        when(reverseGeocodingService.getAddressFromCoordinates(disasterLat, disasterLng))
                .thenReturn(address);

        // Mock FCM batch delivery
        when(fcmNotificationService.sendBatchParallel(anyList())).thenAnswer(inv -> {
            List<?> list = inv.getArgument(0);
            return list.size();
        });

        // Execute notification pipeline
        DisasterNotificationResult result = notificationService.processDisasterNotification(
                disasterId, disasterLat, disasterLng, type, "Severe Flood Alert", 30.0);

        // Assertions
        assertNotNull(result);
        assertEquals(disasterId, result.getDisasterId());
        assertEquals("FLOOD", result.getDisasterType());
        assertEquals(address, result.getResolvedAddress());
        assertEquals(3, result.getCandidateUsersInBoundingBox());

        // Exactly 2 users must be within 30 km (User 1 and User 2; User 3 was filtered out)
        assertEquals(2, result.getUsersWithinRadius());
        assertEquals(2, result.getNotificationsSent());

        // Reverse Geocoding must be called ONCE for the entire disaster event
        verify(reverseGeocodingService, times(1)).getAddressFromCoordinates(disasterLat, disasterLng);

        // Verify FCM payloads sent
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<FcmNotificationPayload>> payloadCaptor = ArgumentCaptor.forClass(List.class);
        verify(fcmNotificationService, times(1)).sendBatchParallel(payloadCaptor.capture());

        List<FcmNotificationPayload> capturedPayloads = payloadCaptor.getValue();
        assertEquals(2, capturedPayloads.size());

        // Verify User 1 Payload contents (Disaster type, Address, Distance)
        FcmNotificationPayload payload1 = capturedPayloads.get(0);
        assertEquals("fcm_token_arun_101", payload1.getFcmToken());
        assertEquals("FLOOD", payload1.getDisasterType());
        assertEquals(address, payload1.getAddress());
        assertTrue(payload1.getDistanceKm() < 5.0, "User 1 distance should be ~3.8km");
        assertTrue(payload1.getTitle().contains("FLOOD"));
        assertTrue(payload1.getBody().contains(address));

        // Verify User 2 Payload contents
        FcmNotificationPayload payload2 = capturedPayloads.get(1);
        assertEquals("fcm_token_priya_102", payload2.getFcmToken());
        assertEquals("FLOOD", payload2.getDisasterType());
        assertTrue(payload2.getDistanceKm() > 20.0 && payload2.getDistanceKm() <= 30.0);

        // Verify In-App notifications saved
        verify(notificationRepository, times(2)).save(any(Notification.class));
    }

    @Test
    @DisplayName("Should handle scenario where no candidate users are in proximity")
    void testProcessDisasterNotification_ZeroNearbyUsers() {
        double disasterLat = 28.6139; // New Delhi
        double disasterLng = 77.2090;

        when(userRepository.findUsersInBoundingBox(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(Collections.emptyList());
        when(reverseGeocodingService.getAddressFromCoordinates(disasterLat, disasterLng))
                .thenReturn("Connaught Place, New Delhi");
        when(fcmNotificationService.sendBatchParallel(Collections.emptyList())).thenReturn(0);

        DisasterNotificationResult result = notificationService.processDisasterNotification(
                99L, disasterLat, disasterLng, DisasterType.EARTHQUAKE, "Minor Tremor", 30.0);

        assertEquals(0, result.getCandidateUsersInBoundingBox());
        assertEquals(0, result.getUsersWithinRadius());
        assertEquals(0, result.getNotificationsSent());
        verify(fcmNotificationService, times(1)).sendBatchParallel(Collections.emptyList());
    }

    @Test
    @DisplayName("Should measure execution speed within SLA (< 2 seconds)")
    void testProcessDisasterNotification_ExecutionSpeedWithinSla() {
        when(userRepository.findUsersInBoundingBox(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(Arrays.asList(nearbyUser1));
        when(reverseGeocodingService.getAddressFromCoordinates(anyDouble(), anyDouble()))
                .thenReturn("Test Address");
        when(fcmNotificationService.sendBatchParallel(anyList())).thenReturn(1);

        DisasterNotificationResult result = notificationService.processDisasterNotification(
                1L, 13.0827, 80.2707, DisasterType.FIRE, "Fire Alert", 30.0);

        assertTrue(result.getExecutionDurationMs() < 2000,
                "Execution must take less than 2000ms SLA, took: " + result.getExecutionDurationMs() + "ms");
    }
}
