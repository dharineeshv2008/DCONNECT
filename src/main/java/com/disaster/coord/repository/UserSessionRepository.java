package com.disaster.coord.repository;

import com.disaster.coord.entity.UserSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {
    Optional<UserSession> findByTokenAndIsActiveTrueAndExpiresAtAfter(UUID token, ZonedDateTime now);
    void deleteByExpiresAtBefore(ZonedDateTime now);
}
