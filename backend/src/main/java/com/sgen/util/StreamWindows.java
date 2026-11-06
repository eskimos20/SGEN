package com.sgen.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;

/**
 * Shared sliding-window bests for sample streams — used by curve
 * calculations and activity analysis so the window math lives in one place.
 */
public final class StreamWindows {

    private StreamWindows() {}

    /**
     * Best average over a fixed-length index window (values are per-sample,
     * typically 1 Hz). Returns 0 when fewer samples than the window exist.
     */
    public static double bestIndexWindowAvg(ArrayNode arr, int window) {
        if (arr == null || arr.size() < window) return 0;
        double sum = 0;
        for (int i = 0; i < window; i++) sum += arr.get(i).asDouble(0);
        double best = sum / window;
        for (int i = window; i < arr.size(); i++) {
            sum += arr.get(i).asDouble(0) - arr.get(i - window).asDouble(0);
            if (sum / window > best) best = sum / window;
        }
        return best;
    }

    /**
     * Best average of a value stream over a time window (seconds), using the
     * parallel time stream. A window qualifies when it contains at least
     * coverageFraction of windowSeconds samples.
     */
    public static double bestTimeWindowAvg(JsonNode values, JsonNode times,
                                           int windowSeconds, double coverageFraction) {
        if (values == null || times == null || !values.isArray() || !times.isArray()
                || values.size() != times.size() || windowSeconds <= 0) return 0;

        int n = times.size();
        double bestAvg = 0, windowSum = 0;
        int left = 0;
        for (int right = 0; right < n; right++) {
            windowSum += values.get(right).asDouble(0);
            while (left < right
                    && times.get(right).asDouble() - times.get(left).asDouble() >= windowSeconds) {
                windowSum -= values.get(left).asDouble(0);
                left++;
            }
            int count = right - left + 1;
            if (count >= windowSeconds * coverageFraction) {
                double avg = windowSum / count;
                if (avg > bestAvg) bestAvg = avg;
            }
        }
        return bestAvg;
    }
}
