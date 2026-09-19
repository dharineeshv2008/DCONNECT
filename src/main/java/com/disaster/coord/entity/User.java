package com.disaster.coord.entity;

import com.disaster.coord.enums.Role;
import com.disaster.coord.enums.UserStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.ZonedDateTime;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_users_phone", columnList = "phone"),
    @Index(name = "idx_users_role_status", columnList = "role, status"),
    @Index(name = "idx_users_session_token", columnList = "session_token")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 20)
    private String phone;

    @Column(columnDefinition = "TEXT")
    private String password;

    @Column(name = "session_token", columnDefinition = "TEXT")
    private String sessionToken;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    @Builder.Default
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "organization_name", length = 150)
    private String organizationName;

    @Column(name = "organization_reg_no", length = 100)
    private String organizationRegNo;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private ZonedDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private ZonedDateTime updatedAt;
}
