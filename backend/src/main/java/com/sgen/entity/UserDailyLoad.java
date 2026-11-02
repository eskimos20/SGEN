package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_daily_load")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserDailyLoad {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "load_date", nullable = false)
    private LocalDate loadDate;

    @Column(name = "source", nullable = false, length = 16)
    private String source;

    @Column(name = "training_load", nullable = false)
    private Double trainingLoad = 0.0;

    @Column(name = "activity_count", nullable = false)
    private Integer activityCount = 0;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    @PrePersist
    public void prePersist() {
        if (trainingLoad == null) trainingLoad = 0.0;
        if (activityCount == null) activityCount = 0;
        updatedAt = LocalDateTime.now();
    }
}
