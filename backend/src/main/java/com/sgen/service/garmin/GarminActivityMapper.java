package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.*;
import java.util.List;
import com.sgen.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

/**
 * Maps Garmin Activity API push items to garmin_activities (+streams+intervals).
 * - activities / manuallyUpdatedActivities / moveIQActivities -> summary row
 * - activityDetails -> summary + ~1Hz samples -> streams_json + laps -> intervals
 * Idempotent: upserts keyed by (user_id, garmin_activity_id) / summary_id.
 * Updated summaries overwrite (spec: latest summary wins).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminActivityMapper {

    private final com.sgen.repository.UserRepository userRepository;
    private final GarminConnectionRepository connectionRepository;
    private final GarminActivityRepository activityRepository;
    private final GarminActivityStreamsRepository streamsRepository;
    private final GarminActivityIntervalRepository intervalRepository;
    private final TrainingLoadCalculator trainingLoadCalculator;
    private final IntervalDetectionService intervalDetectionService;
    private final ObjectMapper objectMapper;

    /** Push item shape: flat summary object (no "summary" wrapper). */
    @Transactional
    public void mapSummary(String type, JsonNode item) {
        Long userId = resolveUserId(item.path("userId").asText());
        if (userId == null) return;
        GarminActivity act = upsert(userId, item);
        if ("manuallyUpdatedActivities".equals(type) || "moveIQActivities".equals(type)
                || item.path("manual").asBoolean(false)) {
            act.setManual(true);
        }
        activityRepository.save(act);
    }

    /** Push item shape: {summary:{...}, samples:[...], laps:[...]}. */
    @Transactional
    public void mapDetails(JsonNode item) {
        Long userId = resolveUserId(item.path("userId").asText());
        if (userId == null) return;
        JsonNode summary = item.has("summary") ? item.get("summary") : item;
        GarminActivity act = upsert(userId, summary);
        activityRepository.save(act);

        JsonNode samples = item.path("samples");
        if (samples.isArray() && samples.size() > 0) {
            ObjectNode streams = buildStreams(samples, summary);
            saveStreams(act.getId(), streams, samples.size());
            applyStreamDerivedMetrics(act, streams);
            detectIntervals(act, item.path("laps"), streams);
            Double load = trainingLoadCalculator.compute(act, streams);
            if (load != null) act.setTrainingLoad(load);
            activityRepository.save(act);
        }
    }

    private Long resolveUserId(String garminUserId) {
        return connectionRepository.findByGarminUserId(garminUserId)
                .map(GarminConnection::getUserId).orElseGet(() -> {
                    log.warn("Garmin push for unknown userId {}", garminUserId);
                    return null;
                });
    }

    private GarminActivity upsert(Long userId, JsonNode s) {
        long garminActivityId = s.path("activityId").asLong(0);
        GarminActivity act = garminActivityId > 0
                ? activityRepository.findByUserIdAndGarminActivityId(userId, garminActivityId).orElse(null)
                : null;
        if (act == null) {
            String summaryId = s.path("summaryId").asText(null);
            if (summaryId != null) act = activityRepository.findBySummaryId(summaryId).orElse(null);
        }
        if (act == null) {
            act = GarminActivity.builder().userId(userId).source("GARMIN").build();
        }
        act.setGarminActivityId(garminActivityId > 0 ? garminActivityId : act.getGarminActivityId());
        act.setSummaryId(s.path("summaryId").asText(act.getSummaryId()));
        act.setName(s.path("activityName").asText(act.getName()));
        act.setActivityType(s.path("activityType").asText(act.getActivityType()));
        act.setSportType(normalizeSportType(act.getActivityType()));
        long start = s.path("startTimeInSeconds").asLong(0);
        if (start > 0) act.setStartTime(start);
        Integer offset = s.has("startTimeOffsetInSeconds") ? s.get("startTimeOffsetInSeconds").asInt() : act.getStartTimeOffset();
        act.setStartTimeOffset(offset);
        if (act.getStartTime() != null) {
            act.setStartDateLocal(LocalDateTime.ofInstant(
                    Instant.ofEpochSecond(act.getStartTime() + (offset != null ? offset : 0)), ZoneOffset.UTC));
        }
        act.setDurationS(intOrNull(s, "durationInSeconds"));
        act.setDistanceM(dblOrNull(s, "distanceInMeters"));
        act.setCalories(intOrNull(s, "activeKilocalories"));
        act.setAvgHr(intOrNull(s, "averageHeartRateInBeatsPerMinute"));
        act.setMaxHr(intOrNull(s, "maxHeartRateInBeatsPerMinute"));
        act.setAvgSpeed(dblOrNull(s, "averageSpeedInMetersPerSecond"));
        Double bikeCad = dblOrNull(s, "averageBikeCadenceInRoundsPerMinute");
        Double runCad = dblOrNull(s, "averageRunCadenceInStepsPerMinute");
        act.setAvgCadence(bikeCad != null ? bikeCad : runCad);
        act.setElevationGain(dblOrNull(s, "totalElevationGainInMeters"));
        act.setElevationLoss(dblOrNull(s, "totalElevationLossInMeters"));
        act.setDeviceName(s.path("deviceName").asText(act.getDeviceName()));
        act.setManual(s.path("manual").asBoolean(act.getManual() != null && act.getManual()));
        act.setRawJson(s.toString());
        return act;
    }

    /** samples[] -> normalized streams object in the Intervals.icu shape. */
    private ObjectNode buildStreams(JsonNode samples, JsonNode summary) {
        ObjectNode out = objectMapper.createObjectNode();
        ArrayNode time = out.putArray("time");
        ArrayNode watts = out.putArray("watts");
        ArrayNode hr = out.putArray("heartrate");
        ArrayNode velocity = out.putArray("velocity_smooth");
        ArrayNode distance = out.putArray("distance");
        ArrayNode latlng = out.putArray("latlng");
        ArrayNode altitude = out.putArray("altitude");
        ArrayNode cadence = out.putArray("cadence");
        ArrayNode moving = out.putArray("moving_duration");

        long firstTs = -1;
        for (JsonNode sample : samples) {
            long ts = sample.path("startTimeInSeconds").asLong(0);
            if (firstTs < 0) firstTs = ts;
            // timerDuration is most reliable elapsed-time axis; fall back to ts-delta
            double t = sample.has("timerDurationInSeconds")
                    ? sample.get("timerDurationInSeconds").asDouble()
                    : (firstTs > 0 ? ts - firstTs : 0);
            time.add(t);
            watts.add(sample.path("powerInWatts").asDouble(0));
            hr.add(sample.path("heartRate").asInt(0));
            velocity.add(sample.path("speedMetersPerSecond").asDouble(0));
            distance.add(sample.path("totalDistanceInMeters").asDouble(0));
            double lat = sample.path("latitudeInDegree").asDouble(Double.NaN);
            double lng = sample.path("longitudeInDegree").asDouble(Double.NaN);
            if (Double.isNaN(lat) || Double.isNaN(lng)) {
                latlng.addNull(); latlng.addNull();
            } else {
                ArrayNode pair = latlng.addArray();
                pair.add(lat); pair.add(lng);
            }
            altitude.add(sample.path("elevationInMeters").asDouble(0));
            double cad = sample.has("bikeCadenceInRPM")
                    ? sample.get("bikeCadenceInRPM").asDouble()
                    : sample.path("stepsPerMinute").asDouble(0);
            cadence.add(cad);
            moving.add(sample.path("movingDurationInSeconds").asDouble(0));
        }
        return out;
    }

    private void saveStreams(Long activityId, ObjectNode streams, int sampleCount) {
        GpsTrackTrimmer.trimNormalized(streams);
        GarminActivityStreams entity = streamsRepository.findById(activityId)
                .orElse(GarminActivityStreams.builder().activityId(activityId).build());
        entity.setStreamsJson(streams.toString());
        entity.setSampleCount(sampleCount);
        streamsRepository.save(entity);
    }

    private void applyStreamDerivedMetrics(GarminActivity act, ObjectNode streams) {
        ArrayNode watts = (ArrayNode) streams.get("watts");
        if (watts != null && watts.size() > 0) {
            double sum = 0; double max = 0; int n = 0;
            for (JsonNode w : watts) {
                double v = w.asDouble(0);
                if (v > 0) { sum += v; n++; if (v > max) max = v; }
            }
            if (n > 0) {
                if (act.getAvgPower() == null) act.setAvgPower(sum / n);
                if (act.getMaxPower() == null) act.setMaxPower(max);
            }
        }
        ArrayNode moving = (ArrayNode) streams.get("moving_duration");
        if (moving != null && moving.size() > 0) {
            act.setMovingTimeS((int) Math.round(moving.get(moving.size() - 1).asDouble(0)));
        }
    }

    /** laps[] -> interval rows (LAP type); no laps -> WORK/REST detection. */
    private void detectIntervals(GarminActivity act, JsonNode laps, ObjectNode streams) {
        if (laps == null || !laps.isArray() || laps.size() < 2) {
            List<GarminActivityInterval> detected = intervalDetectionService.detect(
                    act.getId(), act.getUserId(), act.getSportType(), streams);
            if (!detected.isEmpty()) {
                intervalRepository.deleteByActivityId(act.getId());
                detected.forEach(intervalRepository::save);
            }
            return;
        }
        intervalRepository.deleteByActivityId(act.getId());
        ArrayNode time = (ArrayNode) streams.get("time");
        ArrayNode watts = (ArrayNode) streams.get("watts");
        ArrayNode hr = (ArrayNode) streams.get("heartrate");
        long actStart = act.getStartTime() != null ? act.getStartTime() : 0;
        for (int i = 0; i < laps.size(); i++) {
            long lapStart = laps.get(i).path("startTimeInSeconds").asLong(0);
            long lapEnd = (i + 1 < laps.size())
                    ? laps.get(i + 1).path("startTimeInSeconds").asLong(0)
                    : actStart + (act.getDurationS() != null ? act.getDurationS() : 0);
            int startIdx = findStreamIndex(time, lapStart - actStart);
            int endIdx = findStreamIndex(time, lapEnd - actStart);
            if (endIdx <= startIdx) continue;
            intervalRepository.save(GarminActivityInterval.builder()
                    .activityId(act.getId()).stepOrder(i)
                    .startIndex(startIdx).endIndex(endIdx)
                    .durationS((int) (lapEnd - lapStart))
                    .type("LAP")
                    .avgWatts(avgInRange(watts, startIdx, endIdx))
                    .avgHr(avgInRange(hr, startIdx, endIdx))
                    .build());
        }
    }

    private int findStreamIndex(ArrayNode time, double target) {
        if (time == null) return 0;
        int lo = 0, hi = time.size() - 1;
        while (lo < hi) {
            int mid = (lo + hi) / 2;
            if (time.get(mid).asDouble(0) < target) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    private Double avgInRange(ArrayNode arr, int from, int to) {
        if (arr == null) return null;
        double sum = 0; int n = 0;
        for (int i = from; i < Math.min(to, arr.size()); i++) {
            double v = arr.get(i).asDouble(0);
            if (v > 0) { sum += v; n++; }
        }
        return n > 0 ? sum / n : null;
    }

    String normalizeSportType(String activityType) {
        if (activityType == null) return "other";
        String t = activityType.toUpperCase();
        if (t.contains("RUN") || t.contains("TRACK") || t.contains("TRAIL")
                || t.contains("TREADMILL") || t.contains("ULTRA") || t.contains("OBSTACLE")) return "run";
        if (t.contains("CYCL") || t.contains("BIKE") || t.contains("BIKING") || t.contains("BMX")
                || t.contains("GRAVEL") || t.contains("MTB") || t.contains("E_")) return "ride";
        if (t.contains("SWIM")) return "swim";
        if (t.contains("WALK") || t.contains("HIK")) return "walk";
        if (t.contains("STRENGTH") || t.contains("CARDIO") || t.contains("HIIT")) return "strength";
        return "other";
    }

    private Integer intOrNull(JsonNode n, String f) {
        return n.has(f) && !n.get(f).isNull() ? n.get(f).asInt() : null;
    }
    private Double dblOrNull(JsonNode n, String f) {
        return n.has(f) && !n.get(f).isNull() ? n.get(f).asDouble() : null;
    }

    private String nameOf(Long userId) {
        return userRepository.findById(userId).map(com.sgen.entity.User::getUsername).orElse(String.valueOf(userId));
    }
}
