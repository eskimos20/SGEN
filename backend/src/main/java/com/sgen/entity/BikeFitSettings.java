package com.sgen.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "bikefit_settings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BikeFitSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "camera_device_id")
    private String cameraDeviceId;

    @Column(name = "camera_label")
    private String cameraLabel;

    @Column(name = "camera_permission_granted", columnDefinition = "boolean default false")
    @Builder.Default
    private Boolean cameraPermissionGranted = false;

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
}
