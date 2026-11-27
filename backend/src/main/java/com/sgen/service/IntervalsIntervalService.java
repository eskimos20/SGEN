package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Intervals.icu interval operations: fetch/replace intervals on activities,
 * best-effort lookups and interval summaries. Extracted from
 * IntervalsActivityAnalysisService — interval-domain ops live here while the
 * analysis pipeline (processActivity, window math) stays in that service.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsIntervalService {

    private final com.sgen.service.IntervalsApiClient intervalsApi;
    private final ObjectMapper objectMapper;
    private final IntervalsClientFactory clientFactory;
    private final UserService userService;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;
    private final IntervalsActivityAnalysisService analysisService;
    private final com.sgen.util.IntervalsApiRateLimiter rateLimiter;
    private final com.sgen.repository.GarminActivityRepository garminActivityRepository;
    private final com.sgen.repository.GarminActivityStreamsRepository garminActivityStreamsRepository;
    private final com.sgen.repository.GarminActivityIntervalRepository garminActivityIntervalRepository;

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        Long uid = userService.getUserEntityByUsername(username).getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);
        if (activityId != null && activityId.startsWith("garmin_")) {
            // Local Garmin activities have no upstream best-efforts.
            return null;
        }
        if (garminConnected) {
            String cached = intervalsMirrorService.findBestEffortsJson(uid, activityId);
            if (cached != null) {
                try {
                    log.debug("SOURCE=DB user {} best-efforts served from local mirror: {}", username, activityId);
                    return objectMapper.readTree(cached);
                } catch (Exception ignored) {}
            }
            // Never pull activity data from Intervals for Garmin-connected users.
            return null;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = intervalsApi.getString(ctx.client, "/api/v1/activity/{id}/best-efforts", activityId);
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch best efforts for activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to fetch best efforts: " + e.getMessage());
        }
    }

    public JsonNode findBestEfforts(String username, String activityId, String stream,
                                    Integer duration, Integer count, Float minValue,
                                    Boolean excludeIntervals) {
        // Garmin-connected: compute locally from stored streams — same window
        // search as compute-intervals, wrapped in the best-efforts shape.
        if (garminClientFactory.isConnected(
                userService.getUserEntityByUsername(username).getId())) {
            var efforts = computeIntervalsFromStreams(username, activityId, stream,
                    duration, count, null, null);
            if (minValue != null) {
                efforts.removeIf(w -> ((Number) w.get("average")).doubleValue() < minValue);
            }
            var wrap = objectMapper.createObjectNode();
            wrap.set("efforts", objectMapper.valueToTree(efforts));
            return wrap;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            log.info("Finding best efforts for activity {} - stream: {}, duration: {}s, count: {}",
                    activityId, stream, duration, count);
            String json = intervalsApi.getString(ctx.client, uriBuilder -> {
                        uriBuilder.path("/api/v1/activity/{id}/best-efforts");
                        if (stream != null) uriBuilder.queryParam("stream", stream);
                        if (duration != null) uriBuilder.queryParam("duration", duration);
                        if (count != null) uriBuilder.queryParam("count", count);
                        if (minValue != null) uriBuilder.queryParam("minValue", minValue);
                        if (excludeIntervals != null) uriBuilder.queryParam("excludeIntervals", excludeIntervals);
                        return uriBuilder.build(activityId);
                    });
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to find best efforts for activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to find best efforts: " + e.getMessage());
        }
    }

    public JsonNode updateActivityIntervals(String username, String activityId,
                                            List<Map<String, Object>> intervals,
                                            Integer searchDuration,
                                            JsonNode activityNode, JsonNode streamsNode) throws Exception {
        // Local Garmin activities store intervals in garmin_activity_intervals.
        if (activityId != null && activityId.startsWith("garmin_")) {
            return updateLocalGarminIntervals(username, activityId, intervals);
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        rateLimiter.acquire();
        log.info("Updating intervals for activity {} - count: {}", activityId, intervals.size());

        boolean isStrokeBased = activityNode != null && isStrokeBasedActivity(activityNode, streamsNode);
        log.info("Activity {} detected as {} data", activityId,
                isStrokeBased ? "stroke-based" : "time-based");

        if (isStrokeBased) {
            JsonNode res = updateIntervalsWithIntervalStats(ctx.client, activityId, intervals, streamsNode, searchDuration);
            persistIntervalsToMirror(ctx.user.getId(), activityId, res);
            return res;
        }
        String json = ctx.client.put()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/v1/activity/{id}/intervals")
                        .queryParam("all", true)
                        .build(activityId))
                .bodyValue(intervals)
                .retrieve().bodyToMono(String.class).block();
        JsonNode res = objectMapper.readTree(json);
        persistIntervalsToMirror(ctx.user.getId(), activityId, res);
        return res;
    }

    /**
     * Local interval write for garmin_ activities: replaces the rows in
     * garmin_activity_intervals, computing avg/max stats from the stored
     * streams. Returns the stored intervals in the icu_intervals array
     * shape the frontend renders.
     */
    public JsonNode updateLocalGarminIntervals(String username, String activityId,
                                             List<Map<String, Object>> intervals) throws Exception {
        Long uid = userService.getUserEntityByUsername(username).getId();
        Long gid = Long.parseLong(activityId.substring("garmin_".length()));
        var act = garminActivityRepository.findById(gid)
                .orElseThrow(() -> new IllegalArgumentException("Activity not found: " + activityId));
        if (!act.getUserId().equals(uid)) {
            throw new IllegalArgumentException("Activity does not belong to user");
        }
        com.fasterxml.jackson.databind.node.ObjectNode normalized = null;
        var srow = garminActivityStreamsRepository.findByActivityId(gid).orElse(null);
        if (srow != null && srow.getStreamsJson() != null) {
            normalized = com.sgen.service.garmin.CurveCalculator
                    .normalizeStreams(objectMapper.readTree(srow.getStreamsJson()));
        }
        var time = arr(normalized, "time");
        var watts = arr(normalized, "watts");
        var hr = arr(normalized, "heartrate");
        var speed = arr(normalized, "velocity_smooth");
        var cad = arr(normalized, "cadence");

        garminActivityIntervalRepository.deleteByActivityId(gid);
        var out = objectMapper.createArrayNode();
        int order = 0;
        for (Map<String, Object> iv : intervals) {
            Integer s = numOrNull(iv.get("start_index"));
            Integer e = numOrNull(iv.get("end_index"));
            if (s == null || e == null || e < s) continue;
            var row = com.sgen.entity.GarminActivityInterval.builder()
                    .activityId(gid)
                    .stepOrder(order++)
                    .startIndex(s)
                    .endIndex(e)
                    .durationS(time != null && e < time.size()
                            ? (int) Math.round(time.get(e).asDouble(0) - time.get(s).asDouble(0))
                            : e - s)
                    .type(String.valueOf(iv.getOrDefault("type", "WORK")))
                    .avgWatts(avgRange(watts, s, e))
                    .maxWatts(maxRange(watts, s, e))
                    .avgHr(avgRange(hr, s, e))
                    .startHr(hrAt(hr, s))
                    .endHr(hrAt(hr, e - 1))
                    .hrr(hrrAt(hr, e, time))
                    .avgSpeed(avgRange(speed, s, e))
                    .avgCadence(avgRange(cad, s, e))
                    .build();
            garminActivityIntervalRepository.save(row);
            var o = objectMapper.createObjectNode();
            o.put("start_index", s);
            o.put("end_index", e);
            o.put("type", row.getType());
            if (iv.get("label") != null) o.put("label", String.valueOf(iv.get("label")));
            if (row.getDurationS() != null) o.put("duration", row.getDurationS());
            if (row.getAvgWatts() != null) o.put("average_watts", row.getAvgWatts());
            if (row.getMaxWatts() != null) o.put("max_watts", row.getMaxWatts());
            if (row.getAvgHr() != null) o.put("average_heartrate", row.getAvgHr());
            if (row.getStartHr() != null) o.put("start_hr", row.getStartHr());
            if (row.getEndHr() != null) o.put("end_hr", row.getEndHr());
            if (row.getHrr() != null) o.put("hrr", row.getHrr());
            if (row.getAvgSpeed() != null) o.put("average_speed", row.getAvgSpeed());
            if (row.getAvgCadence() != null) o.put("average_cadence", row.getAvgCadence());
            out.add(o);
        }
        log.info("Stored {} local intervals for garmin activity {} (user {})",
                out.size(), activityId, uid);
        return out;
    }

    private com.fasterxml.jackson.databind.node.ArrayNode arr(
            com.fasterxml.jackson.databind.node.ObjectNode n, String key) {
        return n != null && n.get(key) instanceof com.fasterxml.jackson.databind.node.ArrayNode a ? a : null;
    }

    private Integer numOrNull(Object v) {
        return v instanceof Number num ? num.intValue() : null;
    }

    private Double avgRange(com.fasterxml.jackson.databind.node.ArrayNode a, int from, int to) {
        if (a == null || a.isEmpty()) return null;
        int f = Math.max(0, from), t = Math.min(to, a.size() - 1);
        if (t < f) return null;
        double sum = 0; int n = 0;
        for (int i = f; i <= t; i++) {
            var v = a.get(i);
            if (v != null && v.isNumber() && v.asDouble() > 0) { sum += v.asDouble(); n++; }
        }
        return n > 0 ? sum / n : null;
    }

    private Double maxRange(com.fasterxml.jackson.databind.node.ArrayNode a, int from, int to) {
        if (a == null || a.isEmpty()) return null;
        int f = Math.max(0, from), t = Math.min(to, a.size() - 1);
        if (t < f) return null;
        double max = 0;
        for (int i = f; i <= t; i++) {
            var v = a.get(i);
            if (v != null && v.isNumber() && v.asDouble() > max) max = v.asDouble();
        }
        return max > 0 ? max : null;
    }

    /** HR at a stream index — scans outward when the sample itself is 0/null. */
    private Integer hrAt(com.fasterxml.jackson.databind.node.ArrayNode a, int idx) {
        if (a == null || a.isEmpty()) return null;
        int i = Math.max(0, Math.min(idx, a.size() - 1));
        for (int d = 0; d < 30; d++) {
            if (i - d >= 0) { double v = a.get(i - d).asDouble(0); if (v > 0) return (int) Math.round(v); }
            if (d > 0 && i + d < a.size()) { double v = a.get(i + d).asDouble(0); if (v > 0) return (int) Math.round(v); }
        }
        return null;
    }

    /** HR recovery: HR at interval end minus HR ~120s later. */
    private Double hrrAt(com.fasterxml.jackson.databind.node.ArrayNode hr,
                         int endIdx, com.fasterxml.jackson.databind.node.ArrayNode time) {
        Integer endHr = hrAt(hr, endIdx);
        if (endHr == null || time == null || endIdx >= time.size()) return null;
        double target = time.get(endIdx).asDouble(0) + 120.0;
        for (int i = endIdx; i < time.size() && i < endIdx + 600; i++) {
            if (time.get(i).asDouble(0) >= target) {
                Integer post = hrAt(hr, i);
                return post != null ? (double) (endHr - post) : null;
            }
        }
        return null;
    }

    /** Garmin-connected: keep the mirror's intervals_json in sync after edits. */
    private void persistIntervalsToMirror(Long uid, String activityId, JsonNode response) {
        if (!garminClientFactory.isConnected(uid) || response == null) return;
        try {
            JsonNode ints = response.isArray() ? response : response.path("icu_intervals");
            if (ints != null && ints.isArray()) {
                intervalsMirrorService.saveStreams(uid, activityId, null, ints);
            }
        } catch (Exception e) {
            log.debug("Mirror persist intervals for {} failed: {}", activityId, e.getMessage());
        }
    }

    public Map<String, Object> extractIntervalSummary(JsonNode icuIntervals) {
        Map<String, Object> summary = new HashMap<>();
        if (icuIntervals == null || !icuIntervals.isArray() || icuIntervals.size() == 0) return summary;

        List<Map<String, Object>> intervalList = new ArrayList<>();
        for (JsonNode interval : icuIntervals) {
            int duration = interval.path("duration").asInt(0);
            if (duration <= 0) continue;
            double avgWatts = interval.path("average_watts").asDouble(0);
            double avgHr = interval.path("average_heartrate").asDouble(0);
            if (avgWatts <= 0 && avgHr <= 0) continue;

            String intervalType = interval.path("type").asText("").toUpperCase();

            Map<String, Object> data = new HashMap<>();
            data.put("duration_sec", duration);
            if (!intervalType.isEmpty()) data.put("type", intervalType);
            if (avgWatts > 0) data.put("avg_watts", Math.round(avgWatts));
            double startHr = interval.path("start_hr").asDouble(0);
            if (startHr > 0) data.put("start_hr", Math.round(startHr));
            double endHr = interval.path("end_hr").asDouble(0);
            if (endHr > 0) data.put("end_hr", Math.round(endHr));
            if (avgHr > 0) data.put("avg_hr", Math.round(avgHr));
            if (interval.has("hrr")) data.put("hrr", Math.round(interval.path("hrr").asDouble(0)));
            double maxWatts = interval.path("max_watts").asDouble(0);
            if (maxWatts > 0) data.put("max_watts", Math.round(maxWatts));
            String zone = interval.path("icu_zone").asText(null);
            if (zone != null && !zone.isEmpty()) data.put("zone", zone);
            intervalList.add(data);
        }

        if (!intervalList.isEmpty()) {
            summary.put("interval_count", intervalList.size());
            summary.put("intervals", intervalList);
        }
        return summary;
    }

    /**
     * Compute best intervals from streams data locally.
     * Finds non-overlapping windows of specified duration with highest average,
     * returns them sorted chronologically (by start time).
     */
    public List<Map<String, Object>> computeIntervalsFromStreams(String username, String activityId,
                                                                  String streamType, Integer duration, Integer count,
                                                                  Integer skipSeconds, Integer cooldownSeconds) {
        Long uid = userService.getUserEntityByUsername(username).getId();
        try {
            log.info("Computing intervals from streams for activity {} - stream: {}, duration: {}s, count: {}, skipSeconds: {}",
                    activityId, streamType, duration, count, skipSeconds);

            // Streams resolution: local garmin table for garmin_ ids, the
            // intervals mirror for Garmin-connected users, the API only for
            // everyone else. No Intervals fetch ever happens for
            // Garmin-connected users.
            boolean garminConnected = garminClientFactory.isConnected(uid);
            JsonNode streams = null;
            if (activityId != null && activityId.startsWith("garmin_")) {
                try {
                    Long gid = Long.parseLong(activityId.substring("garmin_".length()));
                    var srow = garminActivityStreamsRepository.findByActivityId(gid).orElse(null);
                    if (srow != null && srow.getStreamsJson() != null) {
                        streams = objectMapper.readTree(srow.getStreamsJson());
                    }
                } catch (NumberFormatException nfe) {
                    log.debug("Bad garmin activity id {}", activityId);
                }
            } else if (garminConnected) {
                String cached = intervalsMirrorService.findStreamsJson(uid, activityId);
                if (cached != null) {
                    try { streams = objectMapper.readTree(cached); } catch (Exception ignored) {}
                }
            }
            if (streams == null) {
                if (garminConnected) {
                    log.debug("No local streams for {} — returning no intervals", activityId);
                    return new ArrayList<>();
                }
                String streamsJson = intervalsApi.getString(
                        clientFactory.buildContext(userService, username).client,
                        "/api/v1/activity/{id}/streams", activityId);
                streams = objectMapper.readTree(streamsJson);
            }

            // Extract time and value streams — both the Intervals array
            // format [{type,data}] and the normalized object format
            // {time:[...], watts:[...]} used by locally stored Garmin streams.
            List<Double> timeData = new ArrayList<>();
            List<Double> valueData = new ArrayList<>();

            if (streams.isArray()) {
                for (JsonNode stream : streams) {
                    String type = stream.path("type").asText();
                    if ("time".equals(type)) {
                        JsonNode data = stream.path("data");
                        if (data.isArray()) {
                            for (JsonNode d : data) timeData.add(d.asDouble(0));
                        }
                    } else if (streamType.equals(type)) {
                        JsonNode data = stream.path("data");
                        if (data.isArray()) {
                            for (JsonNode d : data) valueData.add(d.asDouble(0));
                        }
                    }
                }
            } else if (streams.isObject()) {
                JsonNode t = streams.get("time");
                JsonNode v = streams.get(streamType);
                if (t != null && t.isArray()) for (JsonNode d : t) timeData.add(d.asDouble(0));
                if (v != null && v.isArray()) for (JsonNode d : v) valueData.add(d.asDouble(0));
            }

            if (timeData.isEmpty() || valueData.isEmpty() || timeData.size() != valueData.size()) {
                log.warn("Invalid stream data for activity {}: time={}, values={}", activityId, timeData.size(), valueData.size());
                return new ArrayList<>();
            }

            // Find all valid windows using sliding window
            List<Map<String, Object>> allWindows = new ArrayList<>();
            int n = timeData.size();
            double windowSeconds = duration != null ? duration : 600;
            double minWindowSeconds = windowSeconds * 0.9; // Allow 10% tolerance

            int left = 0;
            double windowSum = 0;

            for (int right = 0; right < n; right++) {
                windowSum += valueData.get(right);

                // Shrink window from left while duration exceeds target
                while (left < right && timeData.get(right) - timeData.get(left) > windowSeconds) {
                    windowSum -= valueData.get(left);
                    left++;
                }

                double actualDuration = timeData.get(right) - timeData.get(left);
                if (actualDuration >= minWindowSeconds) {
                    int windowSize = right - left + 1;
                    double avg = windowSum / windowSize;
                    Map<String, Object> window = new HashMap<>();
                    window.put("start_index", left);
                    window.put("end_index", right);
                    window.put("average", avg);
                    window.put("duration", (int) Math.round(actualDuration));
                    allWindows.add(window);
                }
            }

            if (allWindows.isEmpty()) {
                return new ArrayList<>();
            }

            // Filter out windows that start before skipSeconds (warmup period)
            if (skipSeconds != null && skipSeconds > 0) {
                final double skipTime = skipSeconds;
                allWindows.removeIf(w -> {
                    int startIdx = (Integer) w.get("start_index");
                    return timeData.get(startIdx) < skipTime;
                });
            }

            // Filter out windows that end after cooldown period (from the end)
            if (cooldownSeconds != null && cooldownSeconds > 0 && !allWindows.isEmpty()) {
                final double totalDuration = timeData.get(timeData.size() - 1);
                final double cooldownCutoff = totalDuration - cooldownSeconds;
                allWindows.removeIf(w -> {
                    int endIdx = (Integer) w.get("end_index");
                    return timeData.get(endIdx) > cooldownCutoff;
                });
            }

            if (allWindows.isEmpty()) {
                return new ArrayList<>();
            }

            // Sort by average (descending) first to prioritize best efforts
            allWindows.sort((a, b) -> Double.compare((Double) b.get("average"), (Double) a.get("average")));

            // Select non-overlapping intervals (highest average first)
            List<Map<String, Object>> selected = new ArrayList<>();
            for (Map<String, Object> window : allWindows) {
                if (selected.size() >= count) break;

                int startIdx = (Integer) window.get("start_index");
                int endIdx = (Integer) window.get("end_index");

                boolean overlaps = selected.stream().anyMatch(s -> {
                    int sStart = (Integer) s.get("start_index");
                    int sEnd = (Integer) s.get("end_index");
                    return startIdx < sEnd && endIdx > sStart;
                });

                if (!overlaps) {
                    selected.add(window);
                }
            }

            // Sort selected intervals chronologically by start_index
            selected.sort((a, b) -> Integer.compare((Integer) a.get("start_index"), (Integer) b.get("start_index")));

            log.info("Found {} intervals for activity {} (requested {}, skip={}s, cooldown={}s)",
                    selected.size(), activityId, count, skipSeconds, cooldownSeconds);

            return selected;

        } catch (Exception e) {
            log.error("Failed to compute intervals from streams for activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to compute intervals: " + e.getMessage());
        }
    }

    private boolean isStrokeBasedActivity(JsonNode activityNode, JsonNode streamsNode) {
        if (streamsNode != null && streamsNode.isArray()) {
            for (JsonNode stream : streamsNode) {
                if ("watts".equals(stream.path("type").asText())) {
                    JsonNode data = stream.path("data");
                    if (data.isArray() && data.size() > 0) {
                        int duration = activityNode.path("moving_time").asInt(0);
                        if (duration > 0) return ((double) data.size() / duration) < 0.9;
                    }
                    break;
                }
            }
        }
        String source = activityNode.path("source").asText("").toLowerCase();
        if (source.contains("concept2") || source.contains("pm5")) return true;
        String type = activityNode.path("type").asText("").toLowerCase();
        if (type.contains("row") || type.contains("ski")) return !source.contains("ergzone");
        return false;
    }

    private JsonNode updateIntervalsWithIntervalStats(WebClient client, String activityId,
                                                      List<Map<String, Object>> intervals,
                                                      JsonNode streamsNode,
                                                      Integer searchDuration) throws Exception {
        List<Double> timeStream = new ArrayList<>();
        if (streamsNode != null && streamsNode.isArray()) {
            for (JsonNode stream : streamsNode) {
                if ("time".equals(stream.path("type").asText())) {
                    JsonNode data = stream.path("data");
                    if (data.isArray()) {
                        for (JsonNode t : data) timeStream.add(t.asDouble(0));
                    }
                    break;
                }
            }
        }

        if (timeStream.isEmpty()) {
            log.warn("No time stream found for activity {}, falling back to standard approach", activityId);
            rateLimiter.acquire();
            String json = client.put()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/activity/{id}/intervals")
                            .queryParam("all", true)
                            .build(activityId))
                    .bodyValue(intervals)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        }

        List<Map<String, Object>> clipped = new ArrayList<>();
        for (Map<String, Object> interval : intervals) {
            int startIndex = (Integer) interval.get("start_index");
            double startTime = startIndex < timeStream.size() ? timeStream.get(startIndex) : 0;
            double targetEndTime = startTime + searchDuration;

            int clippedEndIndex = startIndex;
            for (int j = startIndex; j < timeStream.size() && timeStream.get(j) <= targetEndTime; j++) {
                clippedEndIndex = j;
            }
            Map<String, Object> c = new HashMap<>(interval);
            c.put("start_index", startIndex);
            c.put("end_index", clippedEndIndex);
            clipped.add(c);
        }

        rateLimiter.acquire();
        String json = client.put()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/v1/activity/{id}/intervals")
                        .queryParam("all", true)
                        .build(activityId))
                .bodyValue(clipped)
                .retrieve().bodyToMono(String.class).block();
        return objectMapper.readTree(json);
    }
}
