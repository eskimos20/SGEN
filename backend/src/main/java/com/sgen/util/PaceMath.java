package com.sgen.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Shared pace-curve math — best sustained velocity (m/s) per duration,
 * computed from the velocity stream when present and from the distance
 * stream as fallback. Used by the pace-curve service and activity details.
 */
public final class PaceMath {

    private PaceMath() {}

    /**
     * Check if an Intervals activity type is pace-relevant (running family).
     */
    public static boolean isRunningActivity(String type) {
        if (type == null) return false;
        String lower = type.toLowerCase();
        return lower.contains("run") || lower.contains("trail") || lower.contains("hike")
                || lower.equals("virtualrun");
    }

    /**
     * Best average velocity (m/s) for each duration over a velocity stream.
     * Delegates the window scan to StreamWindows (linear, not quadratic).
     */
    public static Map<Integer, Double> bestVelocityWindows(JsonNode velocityNode, int[] durations) {
        Map<Integer, Double> paceData = new LinkedHashMap<>();
        if (velocityNode == null || !velocityNode.isArray()) return paceData;
        for (int duration : durations) {
            if (duration > velocityNode.size()) continue;
            double best = StreamWindows.bestIndexWindowAvg((ArrayNode) velocityNode, duration);
            if (best > 0) paceData.put(duration, best);
        }
        return paceData;
    }

    /**
     * Best average velocity (m/s) derived from a cumulative distance stream —
     * velocity over a window is (distance[end] − distance[start]) / duration.
     */
    public static Map<Integer, Double> bestVelocityFromDistance(JsonNode distanceNode, int[] durations) {
        Map<Integer, Double> paceData = new LinkedHashMap<>();
        if (distanceNode == null || !distanceNode.isArray()) return paceData;
        int dataPoints = distanceNode.size();
        double[] distances = new double[dataPoints];
        for (int i = 0; i < dataPoints; i++) {
            distances[i] = distanceNode.get(i).asDouble(0);
        }
        for (int duration : durations) {
            if (duration > dataPoints) continue;
            double bestAvgVelocity = 0;
            for (int start = 0; start <= dataPoints - duration; start++) {
                double avgVelocity = (distances[start + duration - 1] - distances[start]) / duration;
                if (avgVelocity > bestAvgVelocity) bestAvgVelocity = avgVelocity;
            }
            if (bestAvgVelocity > 0) paceData.put(duration, bestAvgVelocity);
        }
        return paceData;
    }
}
