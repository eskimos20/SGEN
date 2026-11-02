package com.sgen.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "local_sport_settings")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class LocalSportSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "sport_key", nullable = false, length = 32)
    private String sportKey;

    @Column(name = "display_name", length = 64)
    private String displayName;

    @Column(name = "types_json", columnDefinition = "MEDIUMTEXT")
    private String typesJson;

    @Column(name = "ftp")
    private Integer ftp;

    @Column(name = "indoor_ftp")
    private Integer indoorFtp;

    @Column(name = "lthr")
    private Integer lthr;

    @Column(name = "threshold_pace")
    private Double thresholdPace;

    @Column(name = "zones_json", columnDefinition = "MEDIUMTEXT")
    private String zonesJson;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    public void preUpdate() { this.updatedAt = LocalDateTime.now(); }

    @PrePersist
    public void prePersist() {
        updatedAt = LocalDateTime.now();
    }
}
