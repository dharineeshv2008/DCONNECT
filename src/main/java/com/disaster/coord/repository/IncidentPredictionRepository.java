package com.disaster.coord.repository;

import com.disaster.coord.entity.IncidentPrediction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface IncidentPredictionRepository extends JpaRepository<IncidentPrediction, Long> {

    List<IncidentPrediction> findByDisasterIdOrderByCreatedAtDesc(Long disasterId);
}
