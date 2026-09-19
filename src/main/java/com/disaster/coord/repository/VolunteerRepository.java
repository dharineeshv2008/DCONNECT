package com.disaster.coord.repository;

import com.disaster.coord.entity.VolunteerProfile;
import com.disaster.coord.enums.AvailabilityStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VolunteerRepository extends JpaRepository<VolunteerProfile, Long> {
    Optional<VolunteerProfile> findByUserId(Long userId);
    List<VolunteerProfile> findByAvailabilityStatus(AvailabilityStatus status);
    long countByAvailabilityStatus(AvailabilityStatus status);
}
