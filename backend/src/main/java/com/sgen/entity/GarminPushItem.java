package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "garmin_push_inbox")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminPushItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "summary_type", nullable = false, length = 64)
    private String summaryType;

    @Column(name = "summary_id", unique = true, length = 128)
    private String summaryId;

    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 16)
    private String status = "PENDING";

    @Builder.Default
    @Column(name = "attempts", nullable = false)
    private Integer attempts = 0;

    @Column(name = "last_error", length = 1024)
    private String lastError;

    @Builder.Default
    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt = LocalDateTime.now();

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @PrePersist
    public void prePersist() {
        if (status == null) status = "PENDING";
        if (attempts == null) attempts = 0;
        if (receivedAt == null) receivedAt = LocalDateTime.now();
    }
}
