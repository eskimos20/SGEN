package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * All-time best average power per duration, per user. Maintained by
 * LocalAchievementDetectionService — each analyzed activity tries to
 * beat the stored record for every standard duration.
 */
@Entity
@Table(name = "user_power_records",
        uniqueConstraints = @UniqueConstraint(name = "uq_power_record",
                columnNames = {"user_id", "duration_s"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPowerRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "duration_s", nullable = false)
    private Integer durationS;

    @Column(name = "watts", nullable = false)
    private Double watts;

    @Column(name = "activity_id", nullable = false, length = 64)
    private String activityId;

    @Column(name = "activity_type", length = 64)
    private String activityType;

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
