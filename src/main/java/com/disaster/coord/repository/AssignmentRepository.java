package com.disaster.coord.repository;

import com.disaster.coord.entity.Assignment;
import com.disaster.coord.enums.AssignmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AssignmentRepository extends JpaRepository<Assignment, Long> {
    
    @Query("SELECT a FROM Assignment a WHERE a.volunteer.id = :volunteerProfileId ORDER BY a.assignedAt DESC")
    List<Assignment> findByVolunteerProfileId(@Param("volunteerProfileId") Long volunteerProfileId);

    @Query("SELECT a FROM Assignment a WHERE a.volunteer.user.id = :userId ORDER BY a.assignedAt DESC")
    List<Assignment> findByVolunteerUserId(@Param("userId") Long userId);

    List<Assignment> findByDisasterIdOrderByAssignedAtDesc(Long disasterId);
    List<Assignment> findByStatus(AssignmentStatus status);
    long countByDisasterIdAndStatus(Long disasterId, AssignmentStatus status);
    long countByStatus(AssignmentStatus status);
}
