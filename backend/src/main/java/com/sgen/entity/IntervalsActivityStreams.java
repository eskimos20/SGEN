package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "intervals_activity_streams")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntervalsActivityStreams {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "activity_id", nullable = false, length = 64)
    private String activityId;

    @Column(name = "streams_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String streamsJson;

    @Column(name = "intervals_json", columnDefinition = "MEDIUMTEXT")
    private String intervalsJson;

    @Column(name = "curves_json", columnDefinition = "MEDIUMTEXT")
    private String curvesJson;

    @Column(name = "best_efforts_json", columnDefinition = "MEDIUMTEXT")
    private String bestEffortsJson;

    @Column(name = "map_png", columnDefinition = "MEDIUMBLOB")
    private byte[] mapPng;

    @Column(name = "chart_png", columnDefinition = "MEDIUMBLOB")
    private byte[] chartPng;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
