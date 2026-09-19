package com.disaster.coord.dto;

import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZonedDateTime;
import java.util.UUID;

public class AuthDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RegisterRequest {
        @NotBlank(message = "Name is required")
        private String name;

        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = "^[0-9]{10,15}$", message = "Phone must be 10-15 digits without spaces or special characters")
        private String phone;

        @NotBlank(message = "Password is required")
        @Size(min = 6, message = "Password must be at least 6 characters")
        private String password;

        @NotNull(message = "Role is required")
        private Role role;

        private String organizationName;
        private String organizationRegNo;
        private String volunteerSkills;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LoginRequest {
        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = "^[0-9]{10,15}$", message = "Phone must be 10-15 digits without spaces or special characters")
        private String phone;

        @NotBlank(message = "Password is required")
        private String password;

        private Role role;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AuthResponse {
        private Long id;
        private String name;
        private String phone;
        private Role role;
        private UserStatus status;
        private String organizationName;
        private boolean approved;
        private UUID token;
        private String message;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserProfileDto {
        private Long id;
        private String name;
        private String phone;
        private Role role;
        private UserStatus status;
        private String organizationName;
        private String organizationRegNo;
        private ZonedDateTime createdAt;
    }
}
