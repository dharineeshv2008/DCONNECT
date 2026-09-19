package com.disaster.coord.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZonedDateTime;

public class CommentDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CommentRequest {
        @NotNull(message = "User ID is required")
        private Long userId;

        @NotBlank(message = "Comment message cannot be blank")
        private String message;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CommentResponse {
        private Long id;
        private Long disasterId;
        private Long userId;
        private String userName;
        private String userRole;
        private String message;
        private ZonedDateTime createdAt;
    }
}
