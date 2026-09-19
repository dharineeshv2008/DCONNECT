package com.disaster.coord.controller;

import com.disaster.coord.dto.ApiResponse;
import com.disaster.coord.dto.ResourceDtos.*;
import com.disaster.coord.service.ResourceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/resources")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ResourceController {

    private final ResourceService resourceService;

    @PostMapping
    public ResponseEntity<ApiResponse<ResourceResponse>> addResource(@Valid @RequestBody ResourceRequest request) {
        ResourceResponse response = resourceService.addResource(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Resource contributed to pool successfully", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ResourceResponse>>> getAllResources() {
        List<ResourceResponse> resources = resourceService.getAllResources();
        return ResponseEntity.ok(ApiResponse.ok("Resources retrieved", resources));
    }

    @GetMapping("/disaster/{disasterId}")
    public ResponseEntity<ApiResponse<List<ResourceResponse>>> getResourcesByDisaster(@PathVariable Long disasterId) {
        List<ResourceResponse> resources = resourceService.getResourcesByDisaster(disasterId);
        return ResponseEntity.ok(ApiResponse.ok("Disaster resources retrieved", resources));
    }

    @PatchMapping("/{resourceId}/status")
    public ResponseEntity<ApiResponse<ResourceResponse>> updateStatus(
            @PathVariable Long resourceId,
            @Valid @RequestBody ResourceStatusUpdateRequest request) {
        ResourceResponse response = resourceService.updateResourceStatus(resourceId, request.getStatus());
        return ResponseEntity.ok(ApiResponse.ok("Resource status updated", response));
    }
}
