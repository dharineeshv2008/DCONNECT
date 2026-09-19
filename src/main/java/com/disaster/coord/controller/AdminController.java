package com.disaster.coord.controller;

import com.disaster.coord.dto.AdminDtos.*;
import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.AuthDtos.UserProfileDto;
import com.disaster.coord.dto.DisasterDtos.DisasterAnalyticsDto;
import com.disaster.coord.dto.DisasterDtos.DisasterResponse;
import com.disaster.coord.service.AdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AdminController {

    private final AdminService adminService;

    @PostMapping("/approve-user")
    public ResponseEntity<ApiResponse<UserProfileDto>> approveUser(@Valid @RequestBody UserApprovalRequest request) {
        UserProfileDto result = adminService.approveOrRejectUser(request);
        return ResponseEntity.ok(ApiResponse.ok("User status updated successfully by Admin", result));
    }

    @PostMapping("/approve-disaster")
    public ResponseEntity<ApiResponse<DisasterResponse>> approveDisaster(@Valid @RequestBody DisasterApprovalRequest request) {
        DisasterResponse result = adminService.approveOrRejectDisaster(request);
        return ResponseEntity.ok(ApiResponse.ok("Disaster review action executed", result));
    }

    @GetMapping("/pending-users")
    public ResponseEntity<ApiResponse<List<UserProfileDto>>> getPendingUsers() {
        List<UserProfileDto> pending = adminService.getPendingUsers();
        return ResponseEntity.ok(ApiResponse.ok("Pending organization accounts retrieved", pending));
    }

    @GetMapping("/pending-disasters")
    public ResponseEntity<ApiResponse<List<DisasterResponse>>> getPendingDisasters() {
        List<DisasterResponse> pending = adminService.getPendingDisasters();
        return ResponseEntity.ok(ApiResponse.ok("Pending disaster reports retrieved", pending));
    }

    @GetMapping("/analytics")
    public ResponseEntity<ApiResponse<DisasterAnalyticsDto>> getAnalytics() {
        DisasterAnalyticsDto analytics = adminService.getSystemAnalytics();
        return ResponseEntity.ok(ApiResponse.ok("Real-time system analytics retrieved", analytics));
    }
}
