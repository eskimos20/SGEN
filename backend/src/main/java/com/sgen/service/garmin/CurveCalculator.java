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

    /** Normalize Intervals streams payload to {key: data[]} object form. */
    public static ObjectNode normalizeStreams(JsonNode streams) {
        if (streams == null || streams.isNull()) return null;
        if (streams.isObject()) return (ObjectNode) streams;
        if (streams.isArray()) {
            ObjectNode wrapper = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            for (JsonNode el : streams) {
                String type = el.path("type").asText("");
                if (!type.isEmpty() && el.has("data")) wrapper.set(type, el.get("data"));
            }
            return wrapper;
        }
        return null;
    }

    /** Compute per-stream-key curves for a normalized streams object. */
    public static ObjectNode computeCurves(JsonNode normalized, String... keys) {
        ObjectNode out = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        if (normalized == null) return out;
        for (String key : keys) {
            if (!normalized.has(key)) continue;
            out.set(key, curve(normalized.get(key)));
        }
        return out;
    }

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
