package com.disaster.coord.service;

import com.disaster.coord.dto.AuthDtos.*;
import com.disaster.coord.entity.User;
import com.disaster.coord.entity.VolunteerProfile;
import com.disaster.coord.enums.AvailabilityStatus;
import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import com.disaster.coord.exception.AccessDeniedException;
import com.disaster.coord.exception.AppException;
import com.disaster.coord.exception.ResourceNotFoundException;
import com.disaster.coord.repository.UserRepository;
import com.disaster.coord.repository.VolunteerRepository;
import com.disaster.coord.util.PasswordUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private final UserRepository userRepository;
    private final VolunteerRepository volunteerRepository;
    private final NotificationService notificationService;
    private final SessionService sessionService;

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        String phone = req.getPhone().replaceAll("\\s+", "").trim();
        String name = req.getName().trim();

        if (userRepository.existsByPhone(phone)) {
            throw new AppException("User with phone number " + phone + " already exists. Please log in.");
        }

        UserStatus initialStatus = UserStatus.ACTIVE;
        if (req.getRole() == Role.NGO || req.getRole() == Role.GOVERNMENT_AGENCY) {
            initialStatus = UserStatus.PENDING_APPROVAL;
        }

        String hashedPassword = PasswordUtil.hashPassword(req.getPassword());

        User user = User.builder()
                .name(name)
                .phone(phone)
                .password(hashedPassword)
                .role(req.getRole())
                .status(initialStatus)
                .organizationName(req.getOrganizationName())
                .organizationRegNo(req.getOrganizationRegNo())
                .build();

        user = userRepository.save(user);

        // If registered as Volunteer, create initial volunteer profile
        if (req.getRole() == Role.VOLUNTEER) {
            VolunteerProfile profile = VolunteerProfile.builder()
                    .user(user)
                    .skills(req.getVolunteerSkills() != null ? req.getVolunteerSkills() : "General Relief")
                    .availabilityStatus(AvailabilityStatus.AVAILABLE)
                    .helpedCount(0)
                    .build();
            volunteerRepository.save(profile);
        }

        // Notify Admin if an NGO or Gov agency registered
        if (initialStatus == UserStatus.PENDING_APPROVAL) {
            notificationService.notifyAdmins(
                    "New Organization Approval Required",
                    String.format("%s (%s) registered with phone %s. Admin approval required before publishing.",
                            user.getName(), user.getRole(), user.getPhone()),
                    null
            );
        }

        boolean isApproved = (initialStatus == UserStatus.ACTIVE);
        UUID sessionToken = null;
        if (isApproved) {
            sessionToken = sessionService.createSession(user);
            user.setSessionToken(sessionToken.toString());
            userRepository.save(user);
        }

        String message = isApproved ?
                "Registration successful! Welcome to D-Connect." :
                "Registration received. Your organization account is pending Admin approval.";

        return AuthResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .phone(user.getPhone())
                .role(user.getRole())
                .status(user.getStatus())
                .organizationName(user.getOrganizationName())
                .approved(isApproved)
                .token(sessionToken)
                .message(message)
                .build();
    }

    @Transactional
    public AuthResponse login(LoginRequest req) {
        String phone = req.getPhone().replaceAll("\\s+", "").trim();
        String rawPassword = req.getPassword();

        Optional<User> userOpt = userRepository.findByPhone(phone);
        if (userOpt.isEmpty()) {
            throw new AppException("Invalid credentials. Please check your phone number and password.");
        }

        User user = userOpt.get();

        // 1. Password Verification
        if (user.getPassword() != null && !PasswordUtil.matches(rawPassword, user.getPassword())) {
            throw new AppException("Invalid credentials. Please check your phone number and password.");
        }

        // 2. Strict Role Verification
        if (req.getRole() != null && user.getRole() != req.getRole()) {
            throw new AppException(
                String.format("Incorrect role selected. This account is registered as '%s', not '%s'.", 
                    user.getRole(), req.getRole())
            );
        }

        // 3. User Account Status Check
        if (user.getStatus() == UserStatus.REJECTED) {
            throw new AccessDeniedException("Your account application was rejected by the administrator.");
        }
        if (user.getStatus() == UserStatus.SUSPENDED) {
            throw new AccessDeniedException("Your account is currently suspended. Please contact system administrator.");
        }
        if (user.getStatus() == UserStatus.PENDING_APPROVAL) {
            return AuthResponse.builder()
                    .id(user.getId())
                    .name(user.getName())
                    .phone(user.getPhone())
                    .role(user.getRole())
                    .status(user.getStatus())
                    .organizationName(user.getOrganizationName())
                    .approved(false)
                    .token(null)
                    .message("Your organization account is pending administrator approval.")
                    .build();
        }

        UUID sessionToken = sessionService.createSession(user);
        user.setSessionToken(sessionToken.toString());
        userRepository.save(user);

        return AuthResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .phone(user.getPhone())
                .role(user.getRole())
                .status(user.getStatus())
                .organizationName(user.getOrganizationName())
                .approved(true)
                .token(sessionToken)
                .message("Login successful.")
                .build();
    }

    @Transactional(readOnly = true)
    public UserProfileDto getUserProfile(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with ID: " + userId));

        return UserProfileDto.builder()
                .id(user.getId())
                .name(user.getName())
                .phone(user.getPhone())
                .role(user.getRole())
                .status(user.getStatus())
                .organizationName(user.getOrganizationName())
                .organizationRegNo(user.getOrganizationRegNo())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
