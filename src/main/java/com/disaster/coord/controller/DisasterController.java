package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.DisasterDtos.*;
import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.service.DisasterService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/disasters")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DisasterController {

    private final DisasterService disasterService;

    @PostMapping("/report")
    public ResponseEntity<ApiResponse<DisasterResponse>> reportDisaster(@Valid @RequestBody DisasterReportRequest request) {
        DisasterResponse response = disasterService.reportDisaster(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(response.getMergeMessage(), response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<DisasterResponse>>> getDisasters(
            @RequestParam(required = false) DisasterStatus status,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lon) {
        List<DisasterResponse> disasters = disasterService.getAllDisasters(status, lat, lon);
        return ResponseEntity.ok(ApiResponse.ok("Disasters retrieved successfully", disasters));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<DisasterResponse>> getDisasterById(
            @PathVariable Long id,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lon) {
        DisasterResponse response = disasterService.getDisasterById(id, lat, lon);
        return ResponseEntity.ok(ApiResponse.ok("Disaster details retrieved", response));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<DisasterResponse>> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody StatusUpdateRequest request,
            @RequestParam(required = false) Long actorId) {
        DisasterResponse response = disasterService.updateDisasterStatus(id, request.getStatus(), actorId);
        return ResponseEntity.ok(ApiResponse.ok("Disaster status updated", response));
    }
}
