package com.disaster.coord.dto;

import com.disaster.coord.enums.ApprovalAction;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class AdminDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserApprovalRequest {
        @NotNull(message = "Admin user ID is required")
        private Long adminId;

        @NotNull(message = "Target User ID is required")
        private Long userId;

        @NotNull(message = "Action is required (APPROVED or REJECTED)")
        private ApprovalAction action;

        private String comments;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DisasterApprovalRequest {
        @NotNull(message = "Admin user ID is required")
        private Long adminId;

        @NotNull(message = "Disaster ID is required")
        private Long disasterId;

        @NotNull(message = "Action is required (APPROVED or REJECTED)")
        private ApprovalAction action;

        private String comments;
    }
}
