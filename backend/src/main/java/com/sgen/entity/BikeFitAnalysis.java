package com.sgen.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "bikefit_analysis")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BikeFitAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "video_filename")
    private String videoFilename;

    @Column(name = "analysis_status")
    private String analysisStatus;

    @Column(name = "detected_side")
    private String detectedSide;

    @Column(name = "detected_body_parts", columnDefinition = "TEXT")
    private String detectedBodyParts;

    @Column(name = "knee_angle_bdc")
    private Double kneeAngleBdc;

    @Column(name = "knee_angle_tdc")
    private Double kneeAngleTdc;

    @Column(name = "hip_angle")
    private Double hipAngle;

    @Column(name = "ankle_angle")
    private Double ankleAngle;

    @Column(name = "back_angle")
    private Double backAngle;

    @Column(name = "shoulder_angle")
    private Double shoulderAngle;

    @Column(name = "elbow_angle")
    private Double elbowAngle;

    @Column(name = "knee_lateral_deviation")
    private Double kneeLateralDeviation;

    @Column(name = "total_score")
    private Double totalScore;

    @Column(name = "knee_bdc_score")
    private Double kneeBdcScore;

    @Column(name = "hip_score")
    private Double hipScore;

    @Column(name = "knee_tdc_score")
    private Double kneeTdcScore;

    @Column(name = "back_score")
    private Double backScore;

    @Column(name = "shoulder_score")
    private Double shoulderScore;

    @Column(name = "ankle_score")
    private Double ankleScore;

    @Column(name = "elbow_score")
    private Double elbowScore;

    @Column(name = "knee_tracking_score")
    private Double kneeTrackingScore;

    @Column(name = "riding_style")
    private String ridingStyle;

    @Column(name = "recommendations", columnDefinition = "TEXT")
    private String recommendations;

    @Column(name = "analysis_data", columnDefinition = "TEXT")
    private String analysisData;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
