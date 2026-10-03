package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.SaveTokenRequest;
import com.disaster.coord.entity.User;
import com.disaster.coord.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Backend endpoint for Android App FCM Token and Location Registration.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TokenController {

    private static final Logger log = LoggerFactory.getLogger(TokenController.class);
    private final UserRepository userRepository;

    @PostMapping("/save-token")
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveToken(@RequestBody SaveTokenRequest request) {
        log.info("Received save-token request: userId={}, lat={}, lng={}, fcmToken={}...",
                request.getUserId(), request.getLatitude(), request.getLongitude(),
                request.getFcmToken() != null ? request.getFcmToken().substring(0, Math.min(12, request.getFcmToken().length())) : "null");

        if (request.getFcmToken() == null || request.getFcmToken().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("fcmToken cannot be null or empty"));
        }

        Long uid = null;
        if (request.getUserId() != null && !request.getUserId().isBlank()) {
            try {
                uid = Long.parseLong(request.getUserId());
            } catch (NumberFormatException e) {
                log.warn("Invalid userId format: {}", request.getUserId());
            }
        }

        Double lat = null;
        Double lng = null;
        if (request.getLatitude() != null && !request.getLatitude().isBlank()) {
            try {
                lat = Double.parseDouble(request.getLatitude());
            } catch (NumberFormatException ignored) {}
        }
        if (request.getLongitude() != null && !request.getLongitude().isBlank()) {
            try {
                lng = Double.parseDouble(request.getLongitude());
            } catch (NumberFormatException ignored) {}
        }

        if (uid != null) {
            final Double finalLat = lat;
            final Double finalLng = lng;
            userRepository.findById(uid).ifPresent(user -> {
                user.setFcmToken(request.getFcmToken());
                if (finalLat != null) user.setHomeLat(finalLat);
                if (finalLng != null) user.setHomeLng(finalLng);
                userRepository.save(user);
                log.info("Updated User #{} FCM token and home location: ({}, {})", uid, finalLat, finalLng);
            });
        }

        Map<String, Object> data = new HashMap<>();
        data.put("userId", request.getUserId());
        data.put("fcmToken", request.getFcmToken());
        data.put("latitude", lat);
        data.put("longitude", lng);
        data.put("status", "REGISTERED");

        return ResponseEntity.ok(ApiResponse.ok("FCM Token and Location saved successfully", data));
    }
}
