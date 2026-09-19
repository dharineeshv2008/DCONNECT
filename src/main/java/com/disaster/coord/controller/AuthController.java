package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.AuthDtos.*;
import com.disaster.coord.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("User registration processed successfully", response));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.ok("Login successful", response));
    }

    @GetMapping("/profile/{userId}")
    public ResponseEntity<ApiResponse<UserProfileDto>> getProfile(@PathVariable Long userId) {
        UserProfileDto profile = authService.getUserProfile(userId);
        return ResponseEntity.ok(ApiResponse.ok("User profile retrieved", profile));
    }
}
