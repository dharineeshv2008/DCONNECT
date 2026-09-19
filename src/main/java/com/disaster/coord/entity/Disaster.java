package com.disaster.coord.entity;

import com.disaster.coord.enums.DisasterStatus;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Severity;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "disasters", indexes = {
    @Index(name = "idx_disasters_coordinates", columnList = "latitude, longitude"),
    @Index(name = "idx_disasters_type_status", columnList = "type, status"),
    @Index(name = "idx_disasters_created_at", columnList = "created_at DESC")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Disaster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private DisasterType type;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Severity severity = Severity.MEDIUM;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;

    @Column(name = "location_name", length = 255)
    private String locationName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private DisasterStatus status = DisasterStatus.PENDING;

    @Column(name = "report_count", nullable = false)
    @Builder.Default
    private Integer reportCount = 1;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verified_by_user_id")
    private User verifiedBy;

    @OneToMany(mappedBy = "disaster", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<DisasterReport> reports = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private ZonedDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private ZonedDateTime updatedAt;
}
