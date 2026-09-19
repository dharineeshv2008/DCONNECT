package com.disaster.coord.repository;

import com.disaster.coord.entity.Disaster;
import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.enums.DisasterType;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.ZonedDateTime;
import java.util.List;

@Repository
public interface DisasterRepository extends JpaRepository<Disaster, Long> {

    List<Disaster> findByStatusOrderByCreatedAtDesc(DisasterStatus status);

    List<Disaster> findByStatusInOrderByCreatedAtDesc(List<DisasterStatus> statuses);

    List<Disaster> findAllByOrderByCreatedAtDesc();

    /**
     * Concurrency-safe candidate lookup with PESSIMISTIC_WRITE lock (SELECT ... FOR UPDATE).
     * Prevents race conditions during concurrent reports within the 3-hour merge window.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Disaster d WHERE d.type = :type " +
           "AND d.status IN :statuses " +
           "AND d.createdAt >= :since")
    List<Disaster> findCandidatesForMergeWithLock(
            @Param("type") DisasterType type,
            @Param("statuses") List<DisasterStatus> statuses,
            @Param("since") ZonedDateTime since
    );

    long countByStatus(DisasterStatus status);

    @Query("SELECT SUM(d.reportCount) FROM Disaster d")
    Long getTotalReportsCount();
}
