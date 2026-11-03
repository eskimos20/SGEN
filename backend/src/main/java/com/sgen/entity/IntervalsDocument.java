package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "intervals_documents")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntervalsDocument {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "doc_key", nullable = false, length = 32)
    private String docKey;

    @Column(name = "payload_json", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String payloadJson;

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    @PreUpdate
    public void touch() { updatedAt = LocalDateTime.now(); }
}
