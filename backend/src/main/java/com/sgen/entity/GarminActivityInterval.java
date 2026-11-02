package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "garmin_activity_intervals")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminActivityInterval {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "activity_id", nullable = false)
    private Long activityId;

    @Column(name = "step_order", nullable = false)
    private Integer stepOrder;

    @Column(name = "start_index")
    private Integer startIndex;

    @Column(name = "end_index")
    private Integer endIndex;

    @Column(name = "duration_s")
    private Integer durationS;

    @Column(name = "type", length = 16)
    private String type;

    @Column(name = "avg_watts")
    private Double avgWatts;

    @Column(name = "max_watts")
    private Double maxWatts;

    @Column(name = "avg_hr")
    private Double avgHr;

    @Column(name = "start_hr")
    private Integer startHr;

    @Column(name = "end_hr")
    private Integer endHr;

    @Column(name = "hrr")
    private Double hrr;

    @Column(name = "zone", length = 8)
    private String zone;

    @Column(name = "avg_speed")
    private Double avgSpeed;

    @Column(name = "avg_cadence")
    private Double avgCadence;
}
