package com.disaster.coord.service;

import com.disaster.coord.entity.DisasterReport;
import com.disaster.coord.exception.RateLimitExceededException;
import com.disaster.coord.repository.DisasterReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class RateLimiterService {

    private static final long RATE_LIMIT_SECONDS = 120; // 2 minutes

    private final DisasterReportRepository reportRepository;
    private final Map<String, Instant> memoryRateLimitMap = new ConcurrentHashMap<>();

    /**
     * Checks if user/phone has submitted a report in the last 2 minutes.
     * Throws RateLimitExceededException if within cooldown.
     */
    public void checkReportRateLimit(Long userId, String phone) {
        Instant now = Instant.now();
        String cacheKey = (userId != null) ? "user_" + userId : "phone_" + phone;

        // 1. In-Memory Cache Check
        Instant lastAttempt = memoryRateLimitMap.get(cacheKey);
        if (lastAttempt != null) {
            long secondsPassed = Duration.between(lastAttempt, now).getSeconds();
            if (secondsPassed < RATE_LIMIT_SECONDS) {
                long retryAfter = RATE_LIMIT_SECONDS - secondsPassed;
                throw new RateLimitExceededException(
                        String.format("Rate limit exceeded. Maximum 1 disaster report per 2 minutes. Please wait %d seconds.", retryAfter),
                        retryAfter
                );
            }
        }

        // 2. Database Fallback Check (guarantees consistency across node restarts)
        Optional<DisasterReport> latestReport = Optional.empty();
        if (userId != null) {
            latestReport = reportRepository.findLatestByReporterId(userId);
        } else if (phone != null && !phone.isBlank()) {
            latestReport = reportRepository.findLatestByReporterPhone(phone);
        }

        if (latestReport.isPresent()) {
            ZonedDateTime reportedAt = latestReport.get().getReportedAt();
            if (reportedAt != null) {
                long secondsSinceLastReport = Duration.between(reportedAt.toInstant(), now).getSeconds();
                if (secondsSinceLastReport < RATE_LIMIT_SECONDS) {
                    long retryAfter = RATE_LIMIT_SECONDS - secondsSinceLastReport;
                    throw new RateLimitExceededException(
                            String.format("Rate limit active. Please wait %d seconds before dispatching another report.", retryAfter),
                            retryAfter
                    );
                }
            }
        }

        // Record current timestamp
        memoryRateLimitMap.put(cacheKey, now);
    }
}
