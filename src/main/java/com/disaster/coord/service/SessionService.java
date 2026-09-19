package com.disaster.coord.service;

import com.disaster.coord.entity.User;
import com.disaster.coord.entity.UserSession;
import com.disaster.coord.exception.UnauthorizedException;
import com.disaster.coord.repository.UserSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SessionService {

    private static final long SESSION_EXPIRY_DAYS = 7;
    private final UserSessionRepository sessionRepository;

    @Transactional
    public UUID createSession(User user) {
        UUID token = UUID.randomUUID();
        UserSession session = UserSession.builder()
                .token(token)
                .user(user)
                .expiresAt(ZonedDateTime.now().plusDays(SESSION_EXPIRY_DAYS))
                .isActive(true)
                .build();
        sessionRepository.save(session);
        return token;
    }

    @Transactional(readOnly = true)
    public User validateAndGetUser(UUID token) {
        if (token == null) {
            throw new UnauthorizedException("Authentication token missing.");
        }

        UserSession session = sessionRepository.findByTokenAndIsActiveTrueAndExpiresAtAfter(token, ZonedDateTime.now())
                .orElseThrow(() -> new UnauthorizedException("Session invalid or expired. Please login again."));

        return session.getUser();
    }

    @Transactional
    public void invalidateSession(UUID token) {
        if (token != null) {
            sessionRepository.findById(token).ifPresent(s -> {
                s.setIsActive(false);
                sessionRepository.save(s);
            });
        }
    }
}
