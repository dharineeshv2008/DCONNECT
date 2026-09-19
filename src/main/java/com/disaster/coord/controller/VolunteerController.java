package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.VolunteerDtos.*;
import com.disaster.coord.service.VolunteerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/volunteers")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class VolunteerController {

    private final VolunteerService volunteerService;

    @GetMapping("/available")
    public ResponseEntity<ApiResponse<List<VolunteerProfileDto>>> getAvailableVolunteers(
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lon) {
        List<VolunteerProfileDto> volunteers = volunteerService.getAvailableVolunteers(lat, lon);
        return ResponseEntity.ok(ApiResponse.ok("Available volunteers retrieved", volunteers));
    }

    @PutMapping("/availability/{userId}")
    public ResponseEntity<ApiResponse<String>> updateAvailability(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateAvailabilityRequest request) {
        volunteerService.updateAvailability(userId, request);
        return ResponseEntity.ok(ApiResponse.ok("Volunteer status updated successfully", "OK"));
    }

    @PostMapping("/assignments")
    public ResponseEntity<ApiResponse<AssignmentResponse>> assignTask(@Valid @RequestBody AssignmentRequest request) {
        AssignmentResponse response = volunteerService.assignTask(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Volunteer assigned to mission successfully", response));
    }

    @PatchMapping("/assignments/{assignmentId}/status")
    public ResponseEntity<ApiResponse<AssignmentResponse>> updateAssignmentStatus(
            @PathVariable Long assignmentId,
            @Valid @RequestBody UpdateAssignmentStatusRequest request,
            @RequestParam(required = false) Long userId) {
        AssignmentResponse response = volunteerService.updateAssignmentStatus(assignmentId, userId, request.getStatus());
        return ResponseEntity.ok(ApiResponse.ok("Assignment status updated", response));
    }

    @GetMapping("/assignments/disaster/{disasterId}")
    public ResponseEntity<ApiResponse<List<AssignmentResponse>>> getAssignmentsByDisaster(@PathVariable Long disasterId) {
        List<AssignmentResponse> assignments = volunteerService.getAssignmentsByDisaster(disasterId);
        return ResponseEntity.ok(ApiResponse.ok("Disaster task assignments retrieved", assignments));
    }

    @GetMapping("/assignments/volunteer/{userId}")
    public ResponseEntity<ApiResponse<List<AssignmentResponse>>> getAssignmentsByVolunteer(@PathVariable Long userId) {
        List<AssignmentResponse> assignments = volunteerService.getAssignmentsByVolunteerUser(userId);
        return ResponseEntity.ok(ApiResponse.ok("Volunteer missions retrieved", assignments));
    }
}
