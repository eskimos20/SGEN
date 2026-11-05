package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.NullNode;

/**
 * Removes the first and last portion of GPS tracks before they are stored or
 * served. The exact start/end location (typically the user's home) is the
 * strongest identifier in a track, while the middle of the route stays useful
 * for the map. Points are nulled rather than removed so stream indices stay
 * aligned with the parallel time/power/HR arrays.
 *
 * Trim window: 10% of the activity duration at each end, clamped to
 * [30s, 300s]. For payloads without a time axis (map endpoint), the same
 * fraction is applied to the point count (GPS samples are ~1 Hz).
 */
public final class GpsTrackTrimmer {

    private static final double TRIM_FRACTION = 0.10;
    private static final double MIN_TRIM_S = 30.0;
    private static final double MAX_TRIM_S = 300.0;
    private static final int MAX_TRIM_POINTS = 300;

    private GpsTrackTrimmer() {}

    /** Trim a normalized streams object ({time:[], latlng:[ [lat,lng], ... ]}). */
    public static void trimNormalized(JsonNode streams) {
        if (streams == null || !streams.isObject()) return;
        JsonNode time = streams.get("time");
        JsonNode latlng = streams.get("latlng");
        if (latlng instanceof ArrayNode arr) {
            if (time instanceof ArrayNode t) trimByTime(t, arr);
            else trimByCount(arr);
        }
    }

    /** Trim an Intervals-format streams array ([{type:"time",data:[...]}, ...]). */
    public static void trimStreamsArray(JsonNode streams) {
        if (streams == null || !streams.isArray()) return;
        ArrayNode timeData = null, latlngData = null;
        for (JsonNode el : streams) {
            if (!(el.get("data") instanceof ArrayNode data)) continue;
            String type = el.path("type").asText("");
            if ("time".equals(type)) timeData = data;
            else if ("latlng".equals(type)) latlngData = data;
        }
        if (latlngData == null) return;
        if (timeData != null) trimByTime(timeData, latlngData);
        else trimByCount(latlngData);
    }

    /** Trim a map payload's latlngs array ([lat,lng] pairs, no time axis). */
    public static void trimLatlngs(JsonNode latlngs) {
        if (latlngs instanceof ArrayNode arr) trimByCount(arr);
    }

    private static void trimByTime(ArrayNode time, ArrayNode latlng) {
        // latlng may be [[lat,lng],...] pairs or flat [lat,lng,lat,lng,...]
        boolean pairs = latlng.size() > 1 && latlng.get(1).isArray();
        int points = pairs ? latlng.size() : latlng.size() / 2;
        int n = Math.min(time.size(), points);
        if (n < 2) return;
        double t0 = time.get(0).asDouble();
        double t1 = time.get(n - 1).asDouble();
        double dur = t1 - t0;
        if (dur <= 0) return;
        double trim = Math.min(MAX_TRIM_S, Math.max(MIN_TRIM_S, dur * TRIM_FRACTION));
        double startCut = t0 + trim;
        double endCut = t1 - trim;
        for (int i = 0; i < n; i++) {
            double t = time.get(i).asDouble();
            if (t < startCut || t > endCut) {
                nullPoint(latlng, pairs ? i : i * 2, pairs);
            }
        }
    }

    private static void trimByCount(ArrayNode latlng) {
        int size = latlng.size();
        if (size < 2) return;
        // Pairs [[lat,lng],...] count as one point; flat arrays step by 2.
        boolean pairs = latlng.get(1) != null && latlng.get(1).isArray();
        int points = pairs ? size : size / 2;
        if (points < 2) return;
        int trim = Math.min(MAX_TRIM_POINTS, (int) Math.ceil(points * TRIM_FRACTION));
        if (trim < 1) trim = 1;
        if (2 * trim >= points) trim = Math.max(1, points / 4);
        int step = pairs ? 1 : 2;
        for (int i = 0; i < trim; i++) {
            nullPoint(latlng, i * step, pairs);
            nullPoint(latlng, (points - 1 - i) * step, pairs);
        }
    }

    private static void nullPoint(ArrayNode latlng, int idx, boolean pairs) {
        if (idx < 0 || idx >= latlng.size()) return;
        latlng.set(idx, NullNode.getInstance());
        if (!pairs && idx + 1 < latlng.size()) latlng.set(idx + 1, NullNode.getInstance());
    }
}
