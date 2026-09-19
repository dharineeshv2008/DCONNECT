package com.disaster.coord.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.ZonedDateTime;

@Entity
@Table(name = "reports", indexes = {
    @Index(name = "idx_reports_disaster_id", columnList = "disaster_id"),
    @Index(name = "idx_reports_reported_at", columnList = "reported_at DESC")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DisasterReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "disaster_id", nullable = false)
    private Disaster disaster;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_id")
    private User reporter;

    @Column(name = "reporter_name", nullable = false, length = 100)
    private String reporterName;

    @Column(name = "reporter_phone", nullable = false, length = 20)
    private String reporterPhone;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;

    @Column(columnDefinition = "TEXT")
    private String message;

    @CreationTimestamp
    @Column(name = "reported_at", updatable = false)
    private ZonedDateTime reportedAt;
}
