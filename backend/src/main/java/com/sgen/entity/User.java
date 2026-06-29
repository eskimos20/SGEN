package com.sgen.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(name = "must_change_password")
    private boolean mustChangePassword;

    @Column(name = "intervals_api_key")
    private String intervalsApiKey;

    @Column(name = "intervals_athlete_id")
    private String intervalsAthleteId;

    @Column(name = "training_preferences", columnDefinition = "TEXT")
    private String trainingPreferences;

    // OpenAI user-level configuration
    @Column(name = "openai_api_key")
    private String openaiApiKey;

    @Column(name = "openai_enabled", columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean openaiEnabled = false;

    @Column(name = "openai_model")
    private String openaiModel;

    @Column(name = "openai_connection_tested", columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean openaiConnectionTested = false;

    // Strava OAuth configuration
    @Column(name = "strava_enabled", columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean stravaEnabled = false;

    @Column(name = "strava_client_id")
    private String stravaClientId;

    @Column(name = "strava_client_secret")
    private String stravaClientSecret;

    @Column(name = "strava_access_token")
    private String stravaAccessToken;

    @Column(name = "strava_refresh_token")
    private String stravaRefreshToken;

    @Column(name = "strava_token_expires_at")
    private Long stravaTokenExpiresAt;

    @Column(name = "last_login")
    private LocalDateTime lastLogin;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum Role {
        ADMIN, USER
    }
}
