package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.GarminWellness;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * Translates a garmin_wellness payload into the Intervals.icu wellness
 * field names the frontend already consumes
 * (hrv, restingHR, sleepSecs, sleepScore, weight, averageStress, etc.).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminWellnessViewMapper {

    private final ObjectMapper objectMapper;

    /** Returns Intervals-shaped fields for one wellness row (empty = nothing useful). */
    public Map<String, Object> toIntervalsFields(GarminWellness row) {
        Map<String, Object> out = new HashMap<>();
        try {
            JsonNode p = objectMapper.readTree(row.getPayloadJson());
            switch (row.getSummaryType()) {
                case "hrv" -> {
                    putIf(out, "hrv", p.path("lastNightAvg").asDouble(0));
                    putIf(out, "hrvSDNN", p.path("lastNight5MinHigh").asDouble(0));
                }
                case "sleeps" -> {
                    putIf(out, "sleepSecs", p.path("durationInSeconds").asDouble(0));
                    JsonNode score = p.path("overallSleepScore");
                    if (score.isObject() && score.has("value")) {
                        out.put("sleepScore", score.get("value").asInt());
                    }
                }
                case "dailies" -> {
                    putIf(out, "restingHR", p.path("restingHeartRateInBeatsPerMinute").asDouble(0));
                    putIf(out, "averageStress", p.path("averageStressLevel").asDouble(0));
                    putIf(out, "steps", p.path("steps").asDouble(0));
                    putIf(out, "kcalBurned", p.path("activeKilocalories").asDouble(0)
                            + p.path("bmrKilocalories").asDouble(0));
                }
                case "bodyComps" -> {
                    double g = p.path("weightInGrams").asDouble(0);
                    if (g > 0) out.put("weight", g / 1000.0);
                    putIf(out, "bodyFat", p.path("bodyFatInPercent").asDouble(0));
                }
                case "userMetrics" -> putIf(out, "vo2max", p.path("vo2Max").asDouble(0));
                case "stressDetails" -> putIf(out, "maxStress", p.path("maxStressLevel").asDouble(0));
                default -> {}
            }
        } catch (Exception ignored) {}
        return out;
    }

    private void putIf(Map<String, Object> out, String key, double v) {
        if (v > 0) out.put(key, v);
    }
}
