package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Best-average-per-duration curves (power, HR, pace) from a samples stream.
 * Shared by GarminActivityViewService — same sliding-window math for all
 * series, matching the Intervals.icu curve shape {secs:[],values:[]}.
 */
public final class CurveCalculator {

    private static final ObjectMapper M = new ObjectMapper();
    private static final int[] DURATIONS = {5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600};

    private CurveCalculator() {}

    public static ObjectNode curve(JsonNode series) {
        ObjectNode out = M.createObjectNode();
        ArrayNode secs = out.putArray("secs");
        ArrayNode vals = out.putArray("values");
        if (!(series instanceof ArrayNode arr) || arr.size() == 0) return out;
        for (int d : DURATIONS) {
            double best = bestAvg(arr, d);
            if (best > 0) {
                secs.add(d);
                vals.add(Math.round(best * 10.0) / 10.0);
            }
        }
        return out;
    }

    static double bestAvg(ArrayNode arr, int window) {
        if (arr.size() < window) return 0;
        double sum = 0;
        for (int i = 0; i < window; i++) sum += arr.get(i).asDouble(0);
        double best = sum / window;
        for (int i = window; i < arr.size(); i++) {
            sum += arr.get(i).asDouble(0) - arr.get(i - window).asDouble(0);
            if (sum / window > best) best = sum / window;
        }
        return best;
    }
}
