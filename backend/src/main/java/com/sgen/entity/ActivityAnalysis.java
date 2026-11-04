package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One row per analyzed activity. Written once when the activity's
 * streams are first stored — activities are never re-analyzed.
 * Status distinguishes COMPLETED (best5minAvg present), NO_DATA
 * (streams exist but contain no usable power window) and FAILED.
 */
@Entity
@Table(name = "activity_analysis",
        uniqueConstraints = @UniqueConstraint(name = "uq_activity_analysis",
                columnNames = {"user_id", "activity_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ActivityAnalysis {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "activity_id", nullable = false, length = 64)
    private String activityId;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "best5min_avg")
    private Double best5minAvg;

    @Column(name = "activity_name")
    private String activityName;

    @Column(name = "activity_type", length = 64)
    private String activityType;

    @Column(name = "activity_date")
    private LocalDate activityDate;

    @Column(name = "indoor")
    private Boolean indoor;

    @Column(name = "weight_kg")
    private Double weightKg;

    /** Per-duration best averages: {"watts":{"300":350,...},"heartrate":{...},"pace":{...}} */
    @Column(name = "best_windows_json", columnDefinition = "MEDIUMTEXT")
    private String bestWindowsJson;

    @Builder.Default
    @Column(name = "computed_at", nullable = false)
    private LocalDateTime computedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        computedAt = LocalDateTime.now();
    }
}
