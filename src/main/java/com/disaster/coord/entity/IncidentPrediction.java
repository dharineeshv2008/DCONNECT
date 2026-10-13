package com.disaster.coord.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.ZonedDateTime;

@Entity
@Table(name = "ml_predictions", indexes = {
    @Index(name = "idx_ml_predictions_disaster_id", columnList = "disaster_id"),
    @Index(name = "idx_ml_predictions_created_at", columnList = "created_at DESC")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncidentPrediction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "disaster_id")
    private Long disasterId;

    @Column(name = "predicted_severity", nullable = false, length = 20)
    private String predictedSeverity;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(columnDefinition = "TEXT")
    private String evidence;

    @Column(name = "model_version", length = 100)
    private String modelVersion;

    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "SUCCESS";

    @Column(name = "description_text", columnDefinition = "TEXT")
    private String descriptionText;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private ZonedDateTime createdAt;
}
