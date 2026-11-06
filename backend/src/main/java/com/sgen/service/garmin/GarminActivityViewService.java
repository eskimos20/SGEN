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
    private final ZoneTimeCalculator zoneTimeCalculator;
    private final UserRepository userRepository;
    private final com.sgen.service.UserLookupService userLookupService;
    private final ObjectMapper objectMapper;

    public Map<String, Object> getDetails(Long userId, Long id) {
        GarminActivity act = activityRepository.findById(id)
                .filter(a -> a.getUserId().equals(userId))
                .orElseThrow(() -> new IllegalArgumentException("Activity not found"));
        log.debug("SOURCE=DB serving activity {} for user {} from local Garmin DB (no Intervals call)", id, userLookupService.usernameOf(userId));
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
            details.put("powerCurve", CurveCalculator.curve(streams.get("watts")));
            details.put("hrCurve", CurveCalculator.curve(streams.get("heartrate")));
            details.put("mapData", mapData(streams));
            ObjectNode zones = zoneTimeCalculator.compute(streams, userId, act.getSportType());
            if (zones.has("icu_zone_times")) {
                ((ObjectNode) details.get("activity")).set("icu_zone_times", zones.get("icu_zone_times"));
            }
            if (zones.has("hr_zone_times")) {
                ((ObjectNode) details.get("activity")).set("hr_zone_times", zones.get("hr_zone_times"));
            }
        }
        return details;
    }


    private ObjectNode mapData(JsonNode streams) {
        ObjectNode map = objectMapper.createObjectNode();
        // Frontend reads mapData.latlngs (same key as the Intervals /map payload).
        // Trim again at serve time — time-based, so already-trimmed stored
        // streams are unaffected (same window, already-null points stay null).
        GpsTrackTrimmer.trimNormalized(streams);
        if (streams.has("latlng")) map.set("latlngs", streams.get("latlng"));
        return map;
    }

}
