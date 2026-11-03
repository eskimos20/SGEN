package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "intervals_activities")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntervalsActivity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "activity_id", nullable = false, length = 64)
    private String activityId;

    @Column(name = "start_date_local")
    private LocalDateTime startDateLocal;

    @Column(name = "moving_time_s")
    private Integer movingTimeS;

    @Column(name = "training_load")
    @Builder.Default
    private Double trainingLoad = 0.0;

    @Column(name = "activity_type", length = 64)
    private String activityType;

    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
        if (trainingLoad == null) trainingLoad = 0.0;
    }
}
