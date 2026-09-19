package com.disaster.coord.repository;

import com.disaster.coord.entity.DisasterReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface DisasterReportRepository extends JpaRepository<DisasterReport, Long> {
    List<DisasterReport> findByDisasterIdOrderByReportedAtDesc(Long disasterId);
    long countByDisasterId(Long disasterId);

    @Query("SELECT r FROM DisasterReport r WHERE r.reporterPhone = :phone ORDER BY r.reportedAt DESC LIMIT 1")
    Optional<DisasterReport> findLatestByReporterPhone(@Param("phone") String phone);

    @Query("SELECT r FROM DisasterReport r WHERE r.reporter.id = :reporterId ORDER BY r.reportedAt DESC LIMIT 1")
    Optional<DisasterReport> findLatestByReporterId(@Param("reporterId") Long reporterId);
}
