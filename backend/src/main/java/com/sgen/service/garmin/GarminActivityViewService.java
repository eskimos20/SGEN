package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.*;
import com.sgen.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Serves activity details for garmin_ activities in the same shape
 * IntervalsService.getActivityDetails returns, so the frontend needs
 * no Garmin-specific handling.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminActivityViewService {

    private final GarminActivityRepository activityRepository;
    private final GarminActivityStreamsRepository streamsRepository;
    private final GarminActivityIntervalRepository intervalRepository;
    private final GarminMergeService mergeService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public Map<String, Object> getDetails(Long userId, Long id) {
        GarminActivity act = activityRepository.findById(id)
                .filter(a -> a.getUserId().equals(userId))
                .orElseThrow(() -> new IllegalArgumentException("Activity not found"));
        Map<String, Object> details = new HashMap<>();
        details.put("activity", mergeService.toIntervalsActivityJson(act));

        JsonNode streams = null;
        Optional<GarminActivityStreams> s = streamsRepository.findById(id);
        if (s.isPresent()) {
            try { streams = objectMapper.readTree(s.get().getStreamsJson()); } catch (Exception ignored) {}
            details.put("streams", streams);
        }

        List<GarminActivityInterval> intervals = intervalRepository.findByActivityIdOrderByStepOrderAsc(id);
        if (!intervals.isEmpty()) {
            ArrayNode icu = objectMapper.createArrayNode();
            for (GarminActivityInterval iv : intervals) {
                ObjectNode o = icu.addObject();
                o.put("type", iv.getType());
                o.put("start_index", iv.getStartIndex());
                o.put("end_index", iv.getEndIndex());
                o.put("duration", iv.getDurationS());
                if (iv.getAvgWatts() != null) o.put("average_watts", iv.getAvgWatts());
                if (iv.getMaxWatts() != null) o.put("max_watts", iv.getMaxWatts());
                if (iv.getAvgHr() != null) o.put("average_heartrate", iv.getAvgHr());
                if (iv.getStartHr() != null) o.put("start_hr", iv.getStartHr());
                if (iv.getEndHr() != null) o.put("end_hr", iv.getEndHr());
                if (iv.getHrr() != null) o.put("hrr", iv.getHrr());
            }
            details.put("intervals", Map.of("icu_intervals", icu));
            ((ObjectNode) details.get("activity")).set("icu_intervals", icu);
        }

        if (streams != null) {
            details.put("powerCurve", powerCurve(streams));
            details.put("mapData", mapData(streams));
        }
        return details;
    }

    /** Best-average watts per standard duration (matches Intervals power-curve shape loosely). */
    private ObjectNode powerCurve(JsonNode streams) {
        ObjectNode curve = objectMapper.createObjectNode();
        ArrayNode watts = streams.has("watts") ? (ArrayNode) streams.get("watts") : null;
        if (watts == null || watts.size() == 0) return curve;
        int[] durations = {5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600};
        ArrayNode secs = curve.putArray("secs");
        ArrayNode vals = curve.putArray("values");
        for (int d : durations) {
            double best = bestAvg(watts, d);
            if (best > 0) { secs.add(d); vals.add(Math.round(best)); }
        }
        return curve;
    }

    private double bestAvg(ArrayNode arr, int window) {
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

    private ObjectNode mapData(JsonNode streams) {
        ObjectNode map = objectMapper.createObjectNode();
        if (streams.has("latlng")) map.set("latlng", streams.get("latlng"));
        return map;
    }
}
