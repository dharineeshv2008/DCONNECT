package com.disaster.coord.entity;

import com.disaster.coord.enums.ResourceType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.ZonedDateTime;

@Entity
@Table(name = "resources", indexes = {
    @Index(name = "idx_resources_disaster", columnList = "disaster_id"),
    @Index(name = "idx_resources_type", columnList = "resource_type")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResourceItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "disaster_id")
    private Disaster disaster;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "provider_id", nullable = false)
    private User provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 50)
    private ResourceType resourceType;

    @Column(name = "resource_name", nullable = false, length = 150)
    private String resourceName;

    @Column(nullable = false)
    private Integer quantity;

    @Column(nullable = false, length = 50)
    private String unit;

    @Column(nullable = false, length = 30)
    @Builder.Default
    private String status = "AVAILABLE";

    @Column(name = "contact_phone", length = 20)
    private String contactPhone;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private ZonedDateTime createdAt;
}
