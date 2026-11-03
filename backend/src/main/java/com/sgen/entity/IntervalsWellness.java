package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "intervals_wellness")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntervalsWellness {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Intervals wellness id is the ISO date (yyyy-MM-dd). */
    @Column(name = "wellness_date", nullable = false)
    private LocalDate wellnessDate;

    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    // Columnar projection of the fields the wellness view serves — populated at persist.
    private Double ctl;
    private Double atl;
    private Double tsb;
    @Column(name = "ramp_rate")
    private Double rampRate;
    private Double hrv;
    @Column(name = "resting_hr")
    private Integer restingHr;
    @Column(name = "sleep_secs")
    private Integer sleepSecs;
    @Column(name = "sleep_score")
    private Double sleepScore;
    @Column(name = "weight_kg")
    private Double weightKg;
    @Column(name = "sp_o2")
    private Double spO2;
    private Double readiness;
    private Double fatigue;
    private Double mood;
    private Double soreness;
    private Double stress;
    @Builder.Default
    @Column(name = "projected", nullable = false)
    private Boolean projected = false;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
