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

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        Long uid = ctx.user.getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);
        if (garminConnected) {
            String cached = intervalsMirrorService.findBestEffortsJson(uid, activityId);
            if (cached != null) {
                try {
                    log.info("SOURCE=DB user {} best-efforts served from local mirror: {}", username, activityId);
                    return objectMapper.readTree(cached);
                } catch (Exception ignored) {}
            }
        }
        try {
            String json = intervalsApi.getString(ctx.client, "/api/v1/activity/{id}/best-efforts", activityId);
            if (garminConnected && json != null) {
                intervalsMirrorService.saveBestEfforts(uid, activityId, json);
            }
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch best efforts for activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to fetch best efforts: " + e.getMessage());
        }
    }

    public JsonNode findBestEfforts(String username, String activityId, String stream,
                                    Integer duration, Integer count, Float minValue,
                                    Boolean excludeIntervals) {
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        rateLimiter.acquire();
        log.info("Updating intervals for activity {} - count: {}", activityId, intervals.size());

        boolean isStrokeBased = isStrokeBasedActivity(activityNode, streamsNode);
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            log.info("Computing intervals from streams for activity {} - stream: {}, duration: {}s, count: {}, skipSeconds: {}",
                    activityId, streamType, duration, count, skipSeconds);

            // Fetch streams data — local mirror first for Garmin users
            Long uid = ctx.user.getId();
            boolean garminConnected = garminClientFactory.isConnected(uid);
            JsonNode streams = null;
            if (garminConnected) {
                String cached = intervalsMirrorService.findStreamsJson(uid, activityId);
                if (cached != null) {
                    try { streams = objectMapper.readTree(cached); } catch (Exception ignored) {}
                }
            }
            if (streams == null) {
                String streamsJson = intervalsApi.getString(ctx.client, "/api/v1/activity/{id}/streams", activityId);
                streams = objectMapper.readTree(streamsJson);
                if (garminConnected) {
                    intervalsMirrorService.saveStreams(uid, activityId, streams, null);
                }
            }

            // Extract time and value streams
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
