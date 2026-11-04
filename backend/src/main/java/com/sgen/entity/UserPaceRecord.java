package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * All-time best pace (m/s) per standard distance, per user.
 * Maintained by LocalAchievementDetectionService.
 */
@Entity
@Table(name = "user_pace_records",
        uniqueConstraints = @UniqueConstraint(name = "uq_pace_record",
                columnNames = {"user_id", "distance_m"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPaceRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "distance_m", nullable = false)
    private Integer distanceM;

    @Column(name = "pace_mps", nullable = false)
    private Double paceMps;

    @Column(name = "activity_id", nullable = false, length = 64)
    private String activityId;

    @Column(name = "activity_date")
    private LocalDate activityDate;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
