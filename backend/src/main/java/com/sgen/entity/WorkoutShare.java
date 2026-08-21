package com.sgen.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "workout_shares")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkoutShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "from_username", nullable = false)
    private String fromUsername;

    @Column(name = "to_username", nullable = false)
    private String toUsername;

    @Column(name = "workout_name", nullable = false)
    private String workoutName;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "tss")
    private Integer tss;

    @Column(name = "source_path", nullable = false)
    private String sourcePath;

    @Column(name = "status", nullable = false)
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(name = "scheduled_date")
    private String scheduledDate;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum Status {
        PENDING, ACCEPTED, DECLINED
    }
}
