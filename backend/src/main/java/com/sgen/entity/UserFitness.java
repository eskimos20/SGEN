package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_fitness")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserFitness {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "fitness_date", nullable = false)
    private LocalDate fitnessDate;

    @Builder.Default
    @Column(name = "daily_load", nullable = false)
    private Double dailyLoad = 0.0;

    @Builder.Default
    @Column(name = "ctl", nullable = false)
    private Double ctl = 0.0;

    @Builder.Default
    @Column(name = "atl", nullable = false)
    private Double atl = 0.0;

    @Builder.Default
    @Column(name = "tsb", nullable = false)
    private Double tsb = 0.0;

    @Column(name = "ramp_rate")
    private Double rampRate;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    @PrePersist
    public void prePersist() {
        if (dailyLoad == null) dailyLoad = 0.0;
        if (ctl == null) ctl = 0.0;
        if (atl == null) atl = 0.0;
        if (tsb == null) tsb = 0.0;
        updatedAt = LocalDateTime.now();
    }
}
