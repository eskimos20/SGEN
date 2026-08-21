package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.util.ActivityStreamDumper;
import com.sgen.util.IntervalsApiRateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Handles all interval and stream analysis for Intervals.icu activities.
 * Responsibilities: fetching/updating intervals, best-effort search,
 * FTP/VO2Max calculation via sliding-window power analysis, interval summary extraction.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsActivityAnalysisService {

    private final ObjectMapper objectMapper;
    private final IntervalsApiRateLimiter rateLimiter;
    private final AppSettingsService appSettingsService;
    private final ActivityStreamDumper activityStreamDumper;
    private final IntervalsClientFactory clientFactory;
    private final UserService userService;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
            String json = ctx.client.get()
                    .uri("/api/v1/activity/{id}/best-efforts", activityId)
                    .retrieve().bodyToMono(String.class).block();
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
            rateLimiter.acquire();
            log.info("Finding best efforts for activity {} - stream: {}, duration: {}s, count: {}",
                    activityId, stream, duration, count);
            String json = ctx.client.get()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/api/v1/activity/{id}/best-efforts");
                        if (stream != null) uriBuilder.queryParam("stream", stream);
                        if (duration != null) uriBuilder.queryParam("duration", duration);
                        if (count != null) uriBuilder.queryParam("count", count);
                        if (minValue != null) uriBuilder.queryParam("minValue", minValue);
                        if (excludeIntervals != null) uriBuilder.queryParam("excludeIntervals", excludeIntervals);
                        return uriBuilder.build(activityId);
                    })
                    .retrieve().bodyToMono(String.class).block();
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
            return updateIntervalsWithIntervalStats(ctx.client, activityId, intervals, streamsNode, searchDuration);
        }
        String json = ctx.client.put()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/v1/activity/{id}/intervals")
                        .queryParam("all", true)
                        .build(activityId))
                .bodyValue(intervals)
                .retrieve().bodyToMono(String.class).block();
        return objectMapper.readTree(json);
    }

    /**
     * Process a single activity to find best 5-min power window for FTP calculation.
     * Returns null if the activity has no usable power data.
     */
    public ActivityProcessingResult processActivity(WebClient client, String activityId, double weightKg) {
        return processActivity(client, activityId, weightKg, null);
    }

    public ActivityProcessingResult processActivity(WebClient client, String activityId, double weightKg, JsonNode cachedIntervals) {
        try {
            JsonNode intervals;
            JsonNode activityDetails = null;

            if (cachedIntervals != null && cachedIntervals.isArray() && cachedIntervals.size() > 0) {
                intervals = cachedIntervals;
            } else {
                rateLimiter.acquire();
                String activityJson = client.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/api/v1/activity/{id}")
                                .queryParam("intervals", "true")
                                .build(activityId))
                        .retrieve().bodyToMono(String.class).block();
                activityDetails = objectMapper.readTree(activityJson);
                intervals = activityDetails.path("icu_intervals");
                if (intervals == null || !intervals.isArray() || intervals.size() == 0) return null;
            }

            rateLimiter.acquire();
            String streamsJson = client.get()
                    .uri("/api/v1/activity/{id}/streams", activityId)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode streams = objectMapper.readTree(streamsJson);

            if (activityDetails != null && appSettingsService.isDumpActivityStreamsEnabled()) {
                String actName = activityDetails.path("name").asText();
                String dateString = activityDetails.path("start_date_local").asText();
                java.time.LocalDate actDate = java.time.LocalDate.parse(dateString.substring(0, 10));
                activityStreamDumper.dumpStreams(actName, actDate, streams);
            }

            double best5minAvg = findBest5MinWindow(streams);
            if (best5minAvg <= 0) return null;

            String actName = activityDetails != null ? activityDetails.path("name").asText() : "";
            String actType = activityDetails != null ? activityDetails.path("type").asText() : "";
            String dateStr = activityDetails != null ? activityDetails.path("start_date_local").asText() : null;
            java.time.LocalDate actDate = (dateStr != null && dateStr.length() >= 10)
                    ? java.time.LocalDate.parse(dateStr.substring(0, 10))
                    : java.time.LocalDate.now();

            return new ActivityProcessingResult(activityId, actName, actType, actDate, best5minAvg);
        } catch (Exception e) {
            return null;
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

            Map<String, Object> data = new HashMap<>();
            data.put("duration_sec", duration);
            if (avgWatts > 0) data.put("avg_watts", Math.round(avgWatts));
            if (avgHr > 0) data.put("avg_hr", Math.round(avgHr));
            double maxHr = interval.path("max_heartrate").asDouble(0);
            if (maxHr > 0) data.put("max_hr", Math.round(maxHr));
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
            rateLimiter.acquire();
            log.info("Computing intervals from streams for activity {} - stream: {}, duration: {}s, count: {}, skipSeconds: {}",
                    activityId, streamType, duration, count, skipSeconds);

            // Fetch streams data
            String streamsJson = ctx.client.get()
                    .uri("/api/v1/activity/{id}/streams", activityId)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode streams = objectMapper.readTree(streamsJson);

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

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

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

    double findBest5MinWindow(JsonNode streams) {
        if (streams == null || !streams.isArray() || streams.size() == 0) return 0;

        JsonNode wattsStream = null, timeStream = null;
        for (JsonNode stream : streams) {
            String type = stream.path("type").asText();
            if ("watts".equals(type)) wattsStream = stream.path("data");
            else if ("time".equals(type)) timeStream = stream.path("data");
        }

        if (wattsStream == null || timeStream == null || !wattsStream.isArray() || !timeStream.isArray()
                || wattsStream.size() != timeStream.size()) return 0;

        int n = timeStream.size();
        int windowSeconds = 300;
        double bestAvg = 0, windowSum = 0;
        int left = 0;

        for (int right = 0; right < n; right++) {
            windowSum += wattsStream.get(right).asDouble(0);
            while (left < right &&
                    timeStream.get(right).asDouble() - timeStream.get(left).asDouble() >= windowSeconds) {
                windowSum -= wattsStream.get(left).asDouble(0);
                left++;
            }
            int count = right - left + 1;
            if (count >= windowSeconds * 0.8) {
                double avg = windowSum / count;
                if (avg > bestAvg) bestAvg = avg;
            }
        }
        return bestAvg;
    }

    // -------------------------------------------------------------------------
    // Result record
    // -------------------------------------------------------------------------

    public static class ActivityProcessingResult {
        public final String activityId;
        public final String activityName;
        public final String activityType;
        public final java.time.LocalDate activityDate;
        public final double best5minAvg;

        public ActivityProcessingResult(String activityId, String activityName, String activityType,
                                        java.time.LocalDate activityDate, double best5minAvg) {
            this.activityId = activityId;
            this.activityName = activityName;
            this.activityType = activityType;
            this.activityDate = activityDate;
            this.best5minAvg = best5minAvg;
        }
    }
}
