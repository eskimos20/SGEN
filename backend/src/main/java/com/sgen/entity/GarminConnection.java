package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "garmin_connections")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "garmin_user_id", unique = true, length = 64)
    private String garminUserId;

    @Column(name = "access_token", columnDefinition = "TEXT")
    private String accessToken;

    @Column(name = "refresh_token", columnDefinition = "TEXT")
    private String refreshToken;

    @Column(name = "token_expires_at")
    private LocalDateTime tokenExpiresAt;

    @Column(name = "refresh_expires_at")
    private LocalDateTime refreshExpiresAt;

    @Column(name = "scopes", length = 512)
    private String scopes;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 16)
    private String status = "ACTIVE";

    @Builder.Default
    @Column(name = "consent_ai_processing", nullable = false)
    private Boolean consentAiProcessing = false;

    @Column(name = "consent_at")
    private LocalDateTime consentAt;

    @Builder.Default
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    @PrePersist
    public void prePersist() {
        if (status == null) status = "ACTIVE";
        if (consentAiProcessing == null) consentAiProcessing = false;
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
}
