package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "garmin_activities")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "garmin_activity_id", nullable = false)
    private Long garminActivityId;

    @Column(name = "summary_id", unique = true, length = 128)
    private String summaryId;

    @Column(name = "name")
    private String name;

    @Column(name = "activity_type", length = 64)
    private String activityType;

    @Column(name = "sport_type", length = 32)
    private String sportType;

    @Column(name = "start_time", nullable = false)
    private Long startTime;

    @Column(name = "start_time_offset")
    private Integer startTimeOffset;

    @Column(name = "start_date_local")
    private LocalDateTime startDateLocal;

    @Column(name = "duration_s")
    private Integer durationS;

    @Column(name = "moving_time_s")
    private Integer movingTimeS;

    @Column(name = "distance_m")
    private Double distanceM;

    @Column(name = "calories")
    private Integer calories;

    @Column(name = "avg_hr")
    private Integer avgHr;

    @Column(name = "max_hr")
    private Integer maxHr;

    @Column(name = "avg_power")
    private Double avgPower;

    @Column(name = "norm_power")
    private Double normPower;

    @Column(name = "max_power")
    private Double maxPower;

    @Column(name = "avg_speed")
    private Double avgSpeed;

    @Column(name = "avg_cadence")
    private Double avgCadence;

    @Column(name = "elevation_gain")
    private Double elevationGain;

    @Column(name = "elevation_loss")
    private Double elevationLoss;

    @Column(name = "training_load")
    private Double trainingLoad;

    @Builder.Default
    @Column(name = "manual", nullable = false)
    private Boolean manual = false;

    @Column(name = "device_name", length = 128)
    private String deviceName;

    @Builder.Default
    @Column(name = "source", nullable = false, length = 16)
    private String source = "GARMIN";

    @Column(name = "raw_json", columnDefinition = "MEDIUMTEXT")
    private String rawJson;

    @Builder.Default
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    /** True if an Intervals-feed activity matches this one (start +-120s, duration +-10%). */
    public boolean isDuplicateOfIntervalsActivity(com.fasterxml.jackson.databind.JsonNode intervalsActivities) {
        if (intervalsActivities == null || !intervalsActivities.isArray() || startTime == null) return false;
        long localT = startTime + (startTimeOffset != null ? startTimeOffset : 0);
        for (com.fasterxml.jackson.databind.JsonNode n : intervalsActivities) {
            String ds = n.path("start_date_local").asText("");
            if (ds.length() < 19) continue;
            try {
                long t = java.time.LocalDateTime.parse(ds.substring(0, 19))
                        .toEpochSecond(java.time.ZoneOffset.UTC);
                if (Math.abs(t - localT) > 120) continue;
                double dur1 = n.path("moving_time").asDouble(n.path("elapsed_time").asDouble(0));
                double dur2 = durationS != null ? durationS : 0;
                if (dur1 <= 0 || dur2 <= 0 || Math.abs(dur1 - dur2) / Math.max(dur1, dur2) <= 0.10) {
                    return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    @PrePersist
    public void prePersist() {
        if (manual == null) manual = false;
        if (source == null) source = "GARMIN";
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
}
