package com.sgen.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Entity
@Table(name = "vo2max_results")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Vo2MaxResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @Column(nullable = false)
    private Double vo2MaxValue;

    @Column(nullable = false)
    private String activityId;

    @Column(nullable = false)
    private String activityName;

    @Column(nullable = false)
    private String activityType;

    @Column(nullable = false)
    private LocalDate activityDate;

    @Column(nullable = false)
    private Double averageWatts;

    @Column(nullable = false)
    private Integer durationSeconds;

    @Column(nullable = false)
    private Double weightKg;

    @Column
    private String rating;

    @Column(nullable = false)
    private Integer rank;
}
