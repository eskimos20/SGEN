package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BikeFitAnalysisDTO {
    private Long id;
    private String analysisStatus;
    private String detectedSide;
    private List<String> detectedBodyParts;
    private AngleData angles;
    private ScoreData scores;
    private Double totalScore;
    private String ridingStyle;
    private String recommendations;
    private LocalDateTime createdAt;
    private VisibilityData visibility;
    private QualityMetrics qualityMetrics;
    private java.util.Map<String, String> annotatedImages;
    private java.util.Map<String, Object> landmarks;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AngleData {
        private Double kneeAngleBdc;
        private Double kneeAngleTdc;
        private Double hipAngle;
        private Double ankleAngle;
        private Double backAngle;
        private Double shoulderAngle;
        private Double elbowAngle;
        private Double kneeLateralDeviation;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ScoreData {
        private Double kneeBdcScore;
        private Double hipScore;
        private Double kneeTdcScore;
        private Double backScore;
        private Double shoulderScore;
        private Double ankleScore;
        private Double elbowScore;
        private Double kneeTrackingScore;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class VisibilityData {
        private Double hip;
        private Double knee;
        private Double ankle;
        private Double shoulder;
        private Double elbow;
        private Double wrist;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QualityMetrics {
        private Integer framesProcessed;
        private Integer framesWithPose;
        private Double poseDetectionRate;
        private Double avgVisibility;
    }
}
