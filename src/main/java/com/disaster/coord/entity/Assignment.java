package com.disaster.coord.entity;

import com.disaster.coord.enums.AssignmentStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.ZonedDateTime;

@Entity
@Table(name = "assignments", indexes = {
    @Index(name = "idx_assignments_volunteer", columnList = "volunteer_id, status"),
    @Index(name = "idx_assignments_disaster", columnList = "disaster_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Assignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "disaster_id", nullable = false)
    private Disaster disaster;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "volunteer_id", nullable = false)
    private VolunteerProfile volunteer;

    @Column(name = "task_title", nullable = false, length = 200)
    private String taskTitle;

    @Column(name = "task_description", nullable = false, columnDefinition = "TEXT")
    private String taskDescription;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private AssignmentStatus status = AssignmentStatus.ASSIGNED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_by_user_id")
    private User assignedBy;

    @CreationTimestamp
    @Column(name = "assigned_at", updatable = false)
    private ZonedDateTime assignedAt;

    @Column(name = "completed_at")
    private ZonedDateTime completedAt;
}
