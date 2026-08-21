package com.sgen.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Generates personalized bike-fit recommendations from joint angles measured
 * client-side with MediaPipe Pose.
 *
 * All target ranges must stay in sync with the frontend AngleDisplay.jsx ranges.
 *
 * Angle conventions:
 *   kneeBDC = max knee extension (interior angle, 180 = straight leg)
 *   kneeTDC = max knee flexion  (interior angle)
 *   hip     = closed hip angle at the top of the stroke (torso-to-thigh)
 *   ankle   = ankle interior angle (knee-ankle-toe)
 *   back    = torso angle from the horizontal (0 = flat/aero, 90 = upright)
 *   elbow   = interior elbow angle (180 = straight arm)
 */
@Service
public class BikeFitAnalysisService {

    public String generatePersonalizedRecommendations(Map<String, Number> angles, String ridingStyle) {
        String style = (ridingStyle == null || ridingStyle.isBlank())
                ? "road"
                : ridingStyle.toLowerCase();

        List<AngleAnalysis> analyses = new ArrayList<>();
        if (angles != null) {
            for (Map.Entry<String, Number> entry : angles.entrySet()) {
                Number value = entry.getValue();
                if (value == null) {
                    continue; // null-safe: skip metrics that weren't measured
                }
                double[] range = getRange(entry.getKey(), style);
                if (range == null) {
                    continue; // skip metrics without a defined target range
                }
                analyses.add(new AngleAnalysis(entry.getKey(), value.doubleValue(), range));
            }
        }

        int total = analyses.size();
        long inRange = analyses.stream().filter(AngleAnalysis::inRange).count();
        int score = total > 0 ? (int) Math.round((inRange * 100.0) / total) : 0;

        StringBuilder out = new StringBuilder();
        out.append("AI BIKEFIT RECOMMENDATIONS\n");
        out.append("Riding Style: ").append(style.toUpperCase()).append("\n\n");
        out.append("FIT ASSESSMENT\n");
        out.append("FIT SCORE: ").append(score).append("%\n\n");
        out.append(overallAssessment(score)).append("\n");
        out.append("\nPRIORITY ADJUSTMENTS\n");
        out.append(recommendations(analyses));
        return out.toString();
    }

    private String recommendations(List<AngleAnalysis> analyses) {
        List<AngleAnalysis> issues = analyses.stream()
                .filter(a -> !a.inRange())
                .sorted(Comparator.comparingDouble(AngleAnalysis::deviation).reversed())
                .collect(Collectors.toList());

        if (issues.isEmpty()) {
            return "No major adjustments needed - your fit is well optimized!\n";
        }

        StringBuilder sb = new StringBuilder();
        int priority = 1;

        // Saddle-height conflict: knee too bent at the bottom yet too open at the top.
        // Raising/lowering the saddle moves both angles the same way, so resolve as one step.
        AngleAnalysis kneeBDC = find(analyses, "kneeBDC");
        AngleAnalysis kneeTDC = find(analyses, "kneeTDC");
        boolean saddleConflict = kneeBDC != null && kneeTDC != null
                && kneeBDC.below() && kneeTDC.above();
        if (saddleConflict) {
            sb.append(priority++).append(". ")
              .append("Knee is too bent at the bottom yet too open at the top - adjust saddle ")
              .append("height in small (5mm) steps together with fore/aft position, re-measuring each time.")
              .append("\n");
        }

        for (AngleAnalysis a : issues) {
            if (saddleConflict && (a.type.equals("kneeBDC") || a.type.equals("kneeTDC"))) {
                continue; // already covered by the saddle-height resolution
            }
            sb.append(priority++).append(". ").append(a.recommendation()).append("\n");
        }
        return sb.toString();
    }

    private AngleAnalysis find(List<AngleAnalysis> analyses, String type) {
        return analyses.stream().filter(a -> a.type.equals(type)).findFirst().orElse(null);
    }

    private String overallAssessment(int score) {
        if (score >= 90) return "EXCELLENT FIT! Your position is very well optimized for your riding style.\n";
        if (score >= 75) return "GOOD FIT! Minor adjustments could optimize your position further.\n";
        if (score >= 60) return "FAIR FIT. Several adjustments needed for optimal comfort and performance.\n";
        return "POOR FIT. Significant adjustments required for comfort and performance.\n";
    }

    // ---- Target ranges (mirror frontend AngleDisplay.jsx) ----
    private double[] getRange(String type, String style) {
        switch (style) {
            case "aero": return aeroRange(type);
            case "mtb":  return mtbRange(type);
            default:     return roadRange(type);
        }
    }

    private double[] roadRange(String type) {
        switch (type) {
            case "kneeBDC": return new double[]{140, 150};
            case "kneeTDC": return new double[]{65, 78};
            case "hip":     return new double[]{55, 75};
            case "ankle":   return new double[]{95, 115};
            case "back":    return new double[]{40, 55};
            case "elbow":   return new double[]{150, 168};
            default:        return null;
        }
    }

    private double[] aeroRange(String type) {
        switch (type) {
            case "kneeBDC": return new double[]{140, 150};
            case "kneeTDC": return new double[]{65, 80};
            case "hip":     return new double[]{45, 62};
            case "ankle":   return new double[]{95, 115};
            case "back":    return new double[]{25, 40};
            case "elbow":   return new double[]{95, 115};
            default:        return null;
        }
    }

    private double[] mtbRange(String type) {
        switch (type) {
            case "kneeBDC": return new double[]{138, 148};
            case "kneeTDC": return new double[]{68, 82};
            case "hip":     return new double[]{62, 82};
            case "ankle":   return new double[]{95, 115};
            case "back":    return new double[]{45, 60};
            case "elbow":   return new double[]{150, 168};
            default:        return null;
        }
    }

    /** A single measured angle compared against its target range. */
    private static class AngleAnalysis {
        final String type;
        final double current;
        final double[] range;

        AngleAnalysis(String type, double current, double[] range) {
            this.type = type;
            this.current = current;
            this.range = range;
        }

        boolean inRange() { return current >= range[0] && current <= range[1]; }
        boolean below()   { return current < range[0]; }
        boolean above()   { return current > range[1]; }

        double deviation() {
            if (inRange()) return 0;
            return below() ? range[0] - current : current - range[1];
        }

        String recommendation() {
            switch (type) {
                case "kneeBDC":
                    return below()
                            ? "Raise saddle by ~" + mm() + "mm - knee is too bent at the bottom of the stroke."
                            : "Lower saddle by ~" + mm() + "mm - knee is over-extended at the bottom of the stroke.";
                case "kneeTDC":
                    return below()
                            ? "Knee is very closed at the top - lower the saddle slightly or move it forward."
                            : "Knee is quite open at the top - raise the saddle slightly or move it backward.";
                case "hip":
                    return below()
                            ? "Hip angle is too closed - raise the handlebars or shorten the reach to open it up."
                            : "Hip angle is too open - lower the handlebars or increase the reach for a more efficient torso.";
                case "ankle":
                    return below()
                            ? "Ankle is quite plantar-flexed (toes down) - try moving the cleats back slightly."
                            : "Ankle is quite dorsiflexed (heel down) - try moving the cleats forward slightly.";
                case "back":
                    return below()
                            ? "Back is very flat/aggressive - raise the handlebars for a more sustainable position."
                            : "Back is quite upright - lower the handlebars or lengthen the stem for more aerodynamics.";
                case "elbow":
                    return below()
                            ? "Elbows are very bent - lengthen the stem or lower the bars to open the arms."
                            : "Elbows are locked out straight - shorten the stem or raise the bars for a softer, safer bend.";
                default:
                    return "Adjust " + type + " toward the target range.";
            }
        }

        /** Rule of thumb: ~2mm of saddle height per degree of knee-angle change. */
        private String mm() {
            return String.format("%.0f", Math.max(1.0, deviation() * 2));
        }
    }
}
