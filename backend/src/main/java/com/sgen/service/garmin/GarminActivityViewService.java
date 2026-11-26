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
    private final TrainingLoadCalculator trainingLoadCalculator;
    private final FitnessModelService fitnessModelService;
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

        String intervalsType = mergeService.intervalsTypeFor(act);

        // Lazy backfill: activities stored before load computation existed
        // (e.g. summary-only pushes like gym sessions) get HRSS on first view.
        if (act.getTrainingLoad() == null && !Boolean.TRUE.equals(act.getLoadOverridden())
                && !Boolean.TRUE.equals(act.getManual())) {
            Double load = trainingLoadCalculator.compute(act, streams, intervalsType);
            if (load != null) {
                act.setTrainingLoad(load);
                activityRepository.save(act);
                fitnessModelService.rebuildGarminLoads(userId);
                ((ObjectNode) details.get("activity")).put("icu_training_load", load);
            }
        }

        List<GarminActivityInterval> intervals = intervalRepository.findByActivityIdOrderByStepOrderAsc(id);
        if (!intervals.isEmpty()) {
            ArrayNode hrStream = streams != null && streams.get("heartrate") instanceof ArrayNode a ? a : null;
            ArrayNode icu = objectMapper.createArrayNode();
            for (GarminActivityInterval iv : intervals) {
                ObjectNode o = icu.addObject();
                o.put("type", iv.getType());
                o.put("start_index", iv.getStartIndex());
                o.put("end_index", iv.getEndIndex());
                // Frontend reads moving_time/elapsed_time for interval duration.
                o.put("moving_time", iv.getDurationS());
                if (iv.getAvgWatts() != null) o.put("average_watts", iv.getAvgWatts());
                if (iv.getMaxWatts() != null) o.put("max_watts", iv.getMaxWatts());
                if (iv.getAvgHr() != null) o.put("average_heartrate", iv.getAvgHr());
                // start/end HR stored at push time; fall back to the stored
                // stream so rows saved before the fields existed still render.
                Integer sHr = iv.getStartHr() != null ? iv.getStartHr() : hrAt(hrStream, iv.getStartIndex());
                Integer eHr = iv.getEndHr() != null ? iv.getEndHr() : hrAt(hrStream, iv.getEndIndex() - 1);
                if (sHr != null) o.put("start_hr", sHr);
                if (eHr != null) o.put("end_hr", eHr);
                if (iv.getHrr() != null) o.put("hrr", iv.getHrr());
            }
            details.put("intervals", Map.of("icu_intervals", icu));
            ((ObjectNode) details.get("activity")).set("icu_intervals", icu);
        }

        if (streams != null) {
            details.put("powerCurve", CurveCalculator.curve(streams.get("watts")));
            details.put("hrCurve", CurveCalculator.curve(streams.get("heartrate")));
            details.put("mapData", mapData(streams));
            ObjectNode zones = zoneTimeCalculator.compute(streams, userId, act.getSportType(), intervalsType);
            if (zones.has("icu_zone_times")) {
                ((ObjectNode) details.get("activity")).set("icu_zone_times", zones.get("icu_zone_times"));
            }
            if (zones.has("icu_hr_zone_times")) {
                ((ObjectNode) details.get("activity")).set("icu_hr_zone_times", zones.get("icu_hr_zone_times"));
            }
        }
        return details;
    }


    /** HR at a stream index — scans outward when the sample itself is 0. */
    private Integer hrAt(ArrayNode a, Integer idx) {
        if (a == null || a.isEmpty() || idx == null) return null;
        int i = Math.max(0, Math.min(idx, a.size() - 1));
        for (int d = 0; d < 30; d++) {
            if (i - d >= 0) { double v = a.get(i - d).asDouble(0); if (v > 0) return (int) Math.round(v); }
            if (d > 0 && i + d < a.size()) { double v = a.get(i + d).asDouble(0); if (v > 0) return (int) Math.round(v); }
        }
        return null;
    }

    private ObjectNode mapData(JsonNode streams) {
        ObjectNode map = objectMapper.createObjectNode();
        // Frontend reads mapData.latlngs (same key as the Intervals /map payload).
        // Trim again at serve time — time-based, so already-trimmed stored
        // streams are unaffected (same window, already-null points stay null).
        GpsTrackTrimmer.trimNormalized(streams);
        // Only claim a map when at least two valid [lat,lng] pairs exist —
        // indoor sessions (strength etc.) store all-null latlng samples and
        // the frontend would otherwise render an empty Route Map box.
        if (streams.get("latlng") instanceof com.fasterxml.jackson.databind.node.ArrayNode ll) {
            int valid = 0;
            for (JsonNode p : ll) {
                if (p != null && p.isArray() && p.size() >= 2
                        && p.get(0).isNumber() && p.get(1).isNumber()) valid++;
            }
            if (valid >= 2) map.set("latlngs", ll);
        }
        return map;
    }

}
