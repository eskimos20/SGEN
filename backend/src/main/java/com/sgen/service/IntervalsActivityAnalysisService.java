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

    private final com.sgen.service.IntervalsApiClient intervalsApi;
    private final ObjectMapper objectMapper;
    private final IntervalsApiRateLimiter rateLimiter;
    private final AppSettingsService appSettingsService;
    private final ActivityStreamDumper activityStreamDumper;
    private final IntervalsClientFactory clientFactory;
    private final UserService userService;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------





    /**
     * Process a single activity to find best 5-min power window for FTP calculation.
     * Returns null if the activity has no usable power data.
     */
    public ActivityProcessingResult processActivity(WebClient client, String activityId, double weightKg) {
        return processActivity(client, activityId, weightKg, null, null);
    }

    public ActivityProcessingResult processActivity(WebClient client, String activityId, double weightKg, JsonNode cachedIntervals) {
        return processActivity(client, activityId, weightKg, cachedIntervals, null);
    }

    public ActivityProcessingResult processActivity(WebClient client, String activityId, double weightKg,
                                                      JsonNode cachedIntervals, JsonNode cachedStreams) {
        try {
            JsonNode intervals;
            JsonNode activityDetails = null;

            if (cachedIntervals != null && cachedIntervals.isArray() && cachedIntervals.size() > 0) {
                intervals = cachedIntervals;
            } else {
                String activityJson = intervalsApi.getString(client, uriBuilder -> uriBuilder
                                .path("/api/v1/activity/{id}")
                                .queryParam("intervals", "true")
                                .build(activityId));
                activityDetails = objectMapper.readTree(activityJson);
                intervals = activityDetails.path("icu_intervals");
                if (intervals == null || !intervals.isArray() || intervals.size() == 0) return null;
            }

            JsonNode streams;
            if (cachedStreams != null && !cachedStreams.isEmpty()
                    && ((cachedStreams.isArray() && cachedStreams.size() > 0)
                            || (cachedStreams.isObject() && cachedStreams.size() > 0))) {
                streams = cachedStreams;
            } else {
                String streamsJson = intervalsApi.getString(client, "/api/v1/activity/{id}/streams", activityId);
                streams = objectMapper.readTree(streamsJson);
            }

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



    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------



    double findBest5MinWindow(JsonNode streams) {
        return findBestWindow(streams, "watts", 300);
    }

    /**
     * Sliding-window best average of the given stream type over
     * windowSeconds. Same algorithm as the original 5-min search,
     * parameterized for multi-duration power/HR analysis.
     */
    public double findBestWindow(JsonNode streams, String streamType, int windowSeconds) {
        if (streams == null || !streams.isArray() || streams.size() == 0 || windowSeconds <= 0) return 0;

        JsonNode valueStream = null, timeStream = null;
        for (JsonNode stream : streams) {
            String type = stream.path("type").asText();
            if (streamType.equals(type)) valueStream = stream.path("data");
            else if ("time".equals(type)) timeStream = stream.path("data");
        }

        if (valueStream == null || timeStream == null || !valueStream.isArray() || !timeStream.isArray()
                || valueStream.size() != timeStream.size()) return 0;

        return com.sgen.util.StreamWindows.bestTimeWindowAvg(
                valueStream, timeStream, windowSeconds, 0.8);
    }

    /** Per-step speed above this is treated as a GPS glitch and clamped. */
    private static final double MAX_STEP_MPS = 12.0;

    /**
     * Best pace (m/s) covering at least targetMeters, via sliding window
     * over cumulative distance (built from a "distance" stream if present,
     * else integrated from velocity_smooth). Returns 0 when the activity
     * does not cover the distance.
     */
    public double findBestPace(JsonNode streams, double targetMeters) {
        if (streams == null || !streams.isArray() || streams.size() == 0 || targetMeters <= 0) return 0;

        JsonNode distStream = null, velStream = null, timeStream = null;
        for (JsonNode stream : streams) {
            String type = stream.path("type").asText();
            if ("distance".equals(type)) distStream = stream.path("data");
            else if ("velocity_smooth".equals(type)) velStream = stream.path("data");
            else if ("time".equals(type)) timeStream = stream.path("data");
        }
        if (timeStream == null || !timeStream.isArray()) return 0;

        int n = timeStream.size();
        double[] cumDist = new double[n];
        if (distStream != null && distStream.isArray() && distStream.size() == n) {
            // Clamp single-step distance jumps: a GPS teleport (+400m in one
            // sample) would otherwise create impossible min-time windows.
            double acc = 0, prevRaw = distStream.get(0).asDouble(0), prevT = timeStream.get(0).asDouble(0);
            for (int i = 0; i < n; i++) {
                double raw = distStream.get(i).asDouble(0);
                double t = timeStream.get(i).asDouble(0);
                double dt = t - prevT;
                double inc = raw - prevRaw;
                if (inc < 0) inc = 0;
                if (dt > 0 && inc / dt > MAX_STEP_MPS) inc = MAX_STEP_MPS * dt;
                acc += inc;
                cumDist[i] = acc;
                prevRaw = raw;
                prevT = t;
            }
        } else if (velStream != null && velStream.isArray() && velStream.size() == n) {
            double acc = 0, prevT = 0;
            for (int i = 0; i < n; i++) {
                double t = timeStream.get(i).asDouble(0);
                acc += velStream.get(i).asDouble(0) * Math.max(0, t - prevT);
                prevT = t;
                cumDist[i] = acc;
            }
        } else {
            return 0;
        }

        // Sliding window: fastest elapsed time covering targetMeters
        double bestPace = 0;
        int left = 0;
        for (int right = 0; right < n; right++) {
            while (left < right && cumDist[right] - cumDist[left] >= targetMeters) {
                double elapsed = timeStream.get(right).asDouble(0) - timeStream.get(left).asDouble(0);
                if (elapsed > 0) {
                    double pace = (cumDist[right] - cumDist[left]) / elapsed;
                    if (pace > bestPace) bestPace = pace;
                }
                left++;
            }
        }
        return bestPace;
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
