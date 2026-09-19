package com.disaster.coord.dto;

import com.disaster.coord.enums.ResourceType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZonedDateTime;

public class ResourceDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ResourceRequest {
        private Long disasterId;

        @NotNull(message = "Provider ID is required")
        private Long providerId;

        @NotNull(message = "Resource type is required")
        private ResourceType resourceType;

        @NotBlank(message = "Resource name is required")
        private String resourceName;

        @NotNull(message = "Quantity is required")
        @Min(value = 1, message = "Quantity must be at least 1")
        private Integer quantity;

        @NotBlank(message = "Unit is required (e.g. packets, litres, sets)")
        private String unit;

        private String contactPhone;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ResourceResponse {
        private Long id;
        private Long disasterId;
        private String disasterTitle;
        private Long providerId;
        private String providerName;
        private String providerRole;
        private ResourceType resourceType;
        private String resourceName;
        private Integer quantity;
        private String unit;
        private String status;
        private String contactPhone;
        private ZonedDateTime createdAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ResourceStatusUpdateRequest {
        @NotBlank(message = "Status is required (AVAILABLE, DISPATCHED, EXHAUSTED)")
        private String status;
    }
}
