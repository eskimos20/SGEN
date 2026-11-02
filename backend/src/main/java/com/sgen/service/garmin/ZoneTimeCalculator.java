package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Time-in-zone from activity streams, Intervals.icu shape:
 * icu_zone_times / hr_zone_times = [{id:"Z1..Z7",secs:n}].
 * Boundaries: FTP/LTHR via GarminSportSettingsService with Coggan defaults
 * (power %FTP: 55,75,90,105,120,150; HR %LTHR: 81,89,93,99,102,105).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ZoneTimeCalculator {

    private static final ObjectMapper M = new ObjectMapper();
    private static final double[] POWER_BOUNDS_PCT = {55, 75, 90, 105, 120, 150};
    private static final double[] HR_BOUNDS_PCT = {81, 89, 93, 99, 102, 105};

    private final GarminSportSettingsService sportSettings;

    public ObjectNode compute(JsonNode streams, Long userId, String sportKey) {
        ObjectNode out = M.createObjectNode();
        ArrayNode watts = streams.has("watts") ? (ArrayNode) streams.get("watts") : null;
        ArrayNode hr = streams.has("heartrate") ? (ArrayNode) streams.get("heartrate") : null;
        ArrayNode time = streams.has("time") ? (ArrayNode) streams.get("time") : null;

        Double ftp = sportSettings.ftpWatts(userId, sportKey);
        Integer lthr = sportSettings.lthr(userId, sportKey);

        if (watts != null && ftp != null && ftp > 0) {
            out.set("icu_zone_times", zoneTimes(watts, time, bounds(POWER_BOUNDS_PCT, ftp)));
        }
        if (hr != null && lthr != null && lthr > 0) {
            out.set("hr_zone_times", zoneTimes(hr, time, bounds(HR_BOUNDS_PCT, lthr)));
        }
        return out;
    }

    private double[] bounds(double[] pct, double base) {
        double[] b = new double[pct.length];
        for (int i = 0; i < pct.length; i++) b[i] = base * pct[i] / 100.0;
        return b;
    }

    private ArrayNode zoneTimes(ArrayNode values, ArrayNode time, double[] bounds) {
        double[] secs = new double[bounds.length + 1];
        int n = values.size();
        for (int i = 0; i < n; i++) {
            double v = values.get(i).asDouble(0);
            if (v <= 0) continue;
            double dt = 1;
            if (time != null && i + 1 < time.size()) {
                dt = Math.max(0.5, time.get(i + 1).asDouble(0) - time.get(i).asDouble(0));
            }
            int zone = 0;
            while (zone < bounds.length && v > bounds[zone]) zone++;
            secs[zone] += dt;
        }
        ArrayNode out = M.createArrayNode();
        for (int z = 0; z < secs.length; z++) {
            ObjectNode zn = out.addObject();
            zn.put("id", "Z" + (z + 1));
            zn.put("secs", Math.round(secs[z]));
        }
        return out;
    }
}
