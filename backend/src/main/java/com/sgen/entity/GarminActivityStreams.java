package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "garmin_activity_streams")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminActivityStreams {

    @Id
    @Column(name = "activity_id")
    private Long activityId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "activity_id")
    private GarminActivity activity;

    @Column(name = "streams_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String streamsJson;

    @Column(name = "sample_count")
    private Integer sampleCount;
}
