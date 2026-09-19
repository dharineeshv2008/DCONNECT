package com.disaster.coord.repository;

import com.disaster.coord.entity.ApprovalLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ApprovalLogRepository extends JpaRepository<ApprovalLog, Long> {
    List<ApprovalLog> findByTargetTypeAndTargetId(String targetType, Long targetId);
    List<ApprovalLog> findAllByOrderByCreatedAtDesc();
}
