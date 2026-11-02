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

    @Column(name = "manual", nullable = false)
    private Boolean manual = false;

    @Column(name = "device_name", length = 128)
    private String deviceName;

    @Column(name = "source", nullable = false, length = 16)
    private String source = "GARMIN";

    @Column(name = "raw_json", columnDefinition = "MEDIUMTEXT")
    private String rawJson;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }
}
