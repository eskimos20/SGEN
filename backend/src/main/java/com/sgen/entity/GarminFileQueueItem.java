package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "garmin_file_queue")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GarminFileQueueItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "summary_id", nullable = false, unique = true, length = 128)
    private String summaryId;

    @Column(name = "garmin_activity_id")
    private Long garminActivityId;

    @Column(name = "callback_url", nullable = false, columnDefinition = "TEXT")
    private String callbackUrl;

    @Column(name = "file_type", length = 16)
    private String fileType;

    @Column(name = "status", nullable = false, length = 16)
    private String status = "PENDING";

    @Column(name = "attempts", nullable = false)
    private Integer attempts = 0;

    @Column(name = "last_error", length = 1024)
    private String lastError;

    @Column(name = "url_expires_at")
    private LocalDateTime urlExpiresAt;

    @Lob
    @Column(name = "fit_bytes", columnDefinition = "MEDIUMBLOB")
    private byte[] fitBytes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "fetched_at")
    private LocalDateTime fetchedAt;
}
