package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "garmin_wellness")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminWellness {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "summary_type", nullable = false, length = 32)
    private String summaryType;

    @Column(name = "summary_date")
    private LocalDate summaryDate;

    @Column(name = "summary_id", unique = true, length = 128)
    private String summaryId;

    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    @Builder.Default
    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt = LocalDateTime.now();

    @PrePersist
    public void prePersist() {
        if (receivedAt == null) receivedAt = LocalDateTime.now();
    }
}
