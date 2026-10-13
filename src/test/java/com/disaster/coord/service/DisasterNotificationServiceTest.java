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

    @Mock
    private FirebasePushSender firebasePushSender;

    @InjectMocks
    private DisasterNotificationService notificationService;

    private User nearbyUser1;
    private User nearbyUser2;
    private User edgeOutsideUser;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(notificationService, "configuredRadiusKm", 25.0);

        // Disaster origin: Chennai Central (13.0827, 80.2707)
        // User 1: Marina Beach (~3.8 km) - WITHIN 25 KM
        nearbyUser1 = User.builder()
                .id(101L)
                .name("Arun Kumar")
                .phone("9876543210")
                .role(Role.USER)
                .status(UserStatus.ACTIVE)
                .homeLat(13.0500)
                .homeLng(80.2824)
                .fcmToken("fcm_token_arun_101")
                .build();

        // User 2: Guindy / Airport (~14.5 km) - WITHIN 25 KM
        nearbyUser2 = User.builder()
                .id(102L)
                .name("Priya Sharma")
                .phone("9876543211")
                .role(Role.USER)
                .status(UserStatus.ACTIVE)
                .homeLat(12.9800)
                .homeLng(80.1800)
                .fcmToken("fcm_token_priya_102")
                .build();

        // User 3: Tambaram (~25.2 km) - OUTSIDE 25 KM
        edgeOutsideUser = User.builder()
                .id(103L)
                .name("Far Citizen")
                .phone("9876543212")
                .role(Role.USER)
                .status(UserStatus.ACTIVE)
                .homeLat(12.9249)
                .homeLng(80.1000)
                .fcmToken("fcm_token_far_103")
                .build();
    }

    @Test
    @DisplayName("Should fetch users via bounding box, filter <= 25km using Haversine, geocode once, and send FCM")
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

        // Execute notification pipeline with default 25.0 km radius
        DisasterNotificationResult result = notificationService.processDisasterNotification(
                disasterId, disasterLat, disasterLng, type, "Severe Flood Alert", 25.0);

        // Assertions
        assertNotNull(result);
        assertEquals(disasterId, result.getDisasterId());
        assertEquals("FLOOD", result.getDisasterType());
        assertEquals(address, result.getResolvedAddress());
        assertEquals(3, result.getCandidateUsersInBoundingBox());

        // Exactly 2 users must be within 25 km (User 1 and User 2; User 3 at 25.2 km was filtered out)
        assertEquals(2, result.getUsersWithinRadius());
        assertEquals(2, result.getNotificationsSent());
        assertEquals(25.0, result.getRadiusKm());

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
        assertTrue(payload2.getDistanceKm() > 10.0 && payload2.getDistanceKm() <= 25.0);

        // Verify In-App notifications saved
        verify(notificationRepository, times(2)).save(any(Notification.class));
    }

    @Test
    @DisplayName("Should deduplicate identical FCM tokens across multiple user accounts within 25km")
    void testProcessDisasterNotification_DeduplicatesTokens() {
        User duplicateTokenUser = User.builder()
                .id(104L)
                .name("Arun Secondary")
                .phone("9876543299")
                .role(Role.VOLUNTEER)
                .status(UserStatus.ACTIVE)
                .homeLat(13.0600)
                .homeLng(80.2750)
                .fcmToken("fcm_token_arun_101") // Same token as nearbyUser1
                .build();

        when(userRepository.findUsersInBoundingBox(anyDouble(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(Arrays.asList(nearbyUser1, duplicateTokenUser));
        when(reverseGeocodingService.getAddressFromCoordinates(anyDouble(), anyDouble()))
                .thenReturn("Chennai Central");
        when(fcmNotificationService.sendBatchParallel(anyList())).thenAnswer(inv -> ((List<?>) inv.getArgument(0)).size());

        DisasterNotificationResult result = notificationService.processDisasterNotification(
                77L, 13.0827, 80.2707, DisasterType.FIRE, "Industrial Fire", 25.0);

        assertEquals(2, result.getCandidateUsersInBoundingBox());
        // Only 1 unique token user should be retained and notified after deduplication
        assertEquals(1, result.getUsersWithinRadius());
        assertEquals(1, result.getNotificationsSent());
    }

    @Test
    @DisplayName("Should safely abort notification dispatch when coordinates are invalid or out of range")
    void testProcessDisasterNotification_InvalidCoordinates() {
        DisasterNotificationResult result = notificationService.processDisasterNotification(
                88L, 105.0, 200.0, DisasterType.FLOOD, "Invalid Coords", 25.0);

        assertNotNull(result);
        assertEquals(0, result.getUsersWithinRadius());
        assertEquals(0, result.getNotificationsSent());
        verifyNoInteractions(userRepository);
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
                99L, disasterLat, disasterLng, DisasterType.EARTHQUAKE, "Minor Tremor", 25.0);

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
                1L, 13.0827, 80.2707, DisasterType.FIRE, "Fire Alert", 25.0);

        assertTrue(result.getExecutionDurationMs() < 2000,
                "Execution must take less than 2000ms SLA, took: " + result.getExecutionDurationMs() + "ms");
    }
}
