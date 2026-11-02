package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "intervals_events")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntervalsEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "event_id", nullable = false, length = 64)
    private String eventId;

    @Column(name = "category", length = 32)
    private String category;

    @Column(name = "start_date_local")
    private LocalDateTime startDateLocal;

    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }
}
