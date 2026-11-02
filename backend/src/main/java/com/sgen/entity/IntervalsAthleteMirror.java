package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "intervals_athlete")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntervalsAthleteMirror {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "athlete_json", columnDefinition = "MEDIUMTEXT")
    private String athleteJson;

    @Column(name = "sport_settings_json", columnDefinition = "MEDIUMTEXT")
    private String sportSettingsJson;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
