package com.disaster.coord.entity;

import com.disaster.coord.enums.AvailabilityStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.ZonedDateTime;

@Entity
@Table(name = "volunteers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VolunteerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(columnDefinition = "TEXT")
    private String skills;

    @Enumerated(EnumType.STRING)
    @Column(name = "availability_status", nullable = false, length = 30)
    @Builder.Default
    private AvailabilityStatus availabilityStatus = AvailabilityStatus.AVAILABLE;

    @Column(name = "helped_count", nullable = false)
    @Builder.Default
    private Integer helpedCount = 0;

    @Column(name = "current_latitude")
    private Double currentLatitude;

    @Column(name = "current_longitude")
    private Double currentLongitude;

    @UpdateTimestamp
    @Column(name = "last_active_at")
    private ZonedDateTime lastActiveAt;
}
