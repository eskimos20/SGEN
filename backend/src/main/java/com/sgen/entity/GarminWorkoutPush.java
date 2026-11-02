package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "garmin_workout_pushes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminWorkoutPush {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "calendar_event_id")
    private Long calendarEventId;

    @Column(name = "intervals_event_id")
    private Integer intervalsEventId;

    @Column(name = "garmin_workout_id", length = 64)
    private String garminWorkoutId;

    @Column(name = "garmin_schedule_id", length = 64)
    private String garminScheduleId;

    @Column(name = "workout_name")
    private String workoutName;

    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    @Column(name = "status", nullable = false, length = 16)
    private String status = "PENDING";

    @Column(name = "last_error", length = 1024)
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    @PrePersist
    public void prePersist() {
        if (status == null) status = "PENDING";
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
}
