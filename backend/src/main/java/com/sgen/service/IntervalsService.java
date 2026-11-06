package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.service.IntervalsActivityAnalysisService.ActivityProcessingResult;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.garmin.FitnessModelService;
import com.sgen.service.garmin.GarminMergeService;
import com.sgen.util.IntervalsApiRateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import jakarta.annotation.PreDestroy;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Core Intervals.icu service. Handles activity fetching, aggregation,
 * upload/delete, and training preferences.
 * Interval/stream analysis is delegated to IntervalsActivityAnalysisService.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsService {

    private final UserService userService;
    private final ObjectMapper objectMapper;
    private final PerformanceService performanceService;
    private final IntervalsClientFactory clientFactory;
    private final IntervalsActivityAnalysisService analysisService;
    private final IntervalsIntervalService intervalsIntervalService;
    private final ActivityAnalysisService activityAnalysisService;
    private final GarminMergeService garminMergeService;
    private final FitnessModelService fitnessModelService;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final com.sgen.repository.IntervalsEventRepository intervalsEventRepository;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;
    private final IntervalsImageService intervalsImageService;
    private final IntervalsStatsService statsService;
    private final IntervalsApiClient intervalsApi;
    private final IntervalsActivityFeedService activityFeedService;
    private final IntervalsActivityDetailService activityDetailService;
    private final IntervalsActivityOpsService activityOpsService;

    private static final int PARALLEL_REQUESTS = 4;
    private final ExecutorService executorService = Executors.newFixedThreadPool(PARALLEL_REQUESTS);

    /** Response built entirely from local Garmin tables — used when the user has no Intervals credentials. */
    private Map<String, Object> buildLocalOnly(String username, com.sgen.entity.User user)  {
        Long uid = user.getId();
        Map<String, Object> allData = new java.util.HashMap<>();
        com.fasterxml.jackson.databind.node.ArrayNode activities = objectMapper.createArrayNode();
        garminMergeService.mergeActivities(uid, activities);
        allData.put("activities", activities);
        allData.put("athlete", objectMapper.createObjectNode());
        allData.put("sportSettings", objectMapper.createObjectNode());
        allData.put("events", objectMapper.createArrayNode());
        allData.put("wellness", garminMergeService.mergeWellness(uid, java.util.List.of()));
        allData.put("hasIntervalsConfig", false);
        log.info("User {} served purely local (no Intervals config)", username);
        return allData;
    }

    /** Session cache: activity ids whose FTP/VO2 stream analysis already ran. */
    private final Map<Long, Set<String>> analyzedIds = new ConcurrentHashMap<>();

    @PreDestroy
    public void shutdown() {
        executorService.shutdown();
    }

    private ApiContext getValidatedContext(String username) {
        return clientFactory.buildContext(userService, username);
    }

    // -------------------------------------------------------------------------
    // Full data fetch (dashboard)
    // -------------------------------------------------------------------------

    public Map<String, Object> fetchAllData(String username, String oldest, String newest) {
        return fetchAllData(username, oldest, newest, false);
    }

    public Map<String, Object> fetchAllData(String username, String oldest, String newest, boolean analyze) {
        long t0 = System.currentTimeMillis();
        Map<String, Object> result = fetchAllDataInner(username, oldest, newest, analyze);
        try {
            int bytes = objectMapper.writeValueAsString(result).length();
            log.info("Statistics for user {} period {}-{}: {} ms, {} KB payload (analyze={})",
                    username, oldest, newest, System.currentTimeMillis() - t0, bytes / 1024, analyze);
        } catch (Exception e) {
            log.info("Statistics for user {} period {}-{}: {} ms",
                    username, oldest, newest, System.currentTimeMillis() - t0);
        }
        return result;
    }

    private Map<String, Object> fetchAllDataInner(String username, String oldest, String newest, boolean analyze) {
        ApiContext ctx;
        try {
            ctx = getValidatedContext(username);
        } catch (RuntimeException e) {
            com.sgen.entity.User u = userService.getUserEntityByUsername(username);
            if (u != null && garminClientFactory.isConnected(u.getId())) {
                // No Intervals creds but Garmin connected — serve purely local
                return buildLocalOnly(username, u);
            }
            throw e;
        }
        String athleteId = ctx.user.getIntervalsAthleteId();
        WebClient client = ctx.client;
        Map<String, Object> allData = new ConcurrentHashMap<>();
        final Map<String, JsonNode> streamsMap = new ConcurrentHashMap<>();
        final Set<String> analyzed = analyzedIds.computeIfAbsent(ctx.user.getId(), k -> ConcurrentHashMap.newKeySet());

        // Garmin-connected: serve everything from local DB — no Intervals
        // activity/stream/wellness calls at all (pure local pipeline).
        boolean garminConnected = garminClientFactory.isConnected(ctx.user.getId());
        if (garminConnected) {
            log.info("User {} has active Garmin connection — local Garmin activities will take precedence in merge", ctx.user.getUsername());
        }

        // Activities (with per-activity intervals fetched concurrently)
        CompletableFuture<JsonNode> activitiesFuture = CompletableFuture.supplyAsync(
                () -> activityFeedService.fetch(ctx, oldest, newest, garminConnected, analyze, streamsMap),
                executorService);

        // Athlete profile + sport settings — same DB-first / API / persist shape
        CompletableFuture<JsonNode> athleteFuture = CompletableFuture.supplyAsync(
                () -> fetchMirroredDoc(ctx, garminConnected, "athlete", "/api/v1/athlete/{id}",
                        (uid, json) -> intervalsMirrorService.saveAthleteProfile(uid, json, null),
                        "athlete profile"),
                executorService);

        CompletableFuture<JsonNode> sportSettingsFuture = CompletableFuture.supplyAsync(
                () -> fetchMirroredDoc(ctx, garminConnected, "sport-settings",
                        "/api/v1/athlete/{id}/sport-settings",
                        (uid, json) -> intervalsMirrorService.saveAthleteProfile(uid, null, json),
                        "sport settings"),
                executorService);

        // Events
        CompletableFuture<JsonNode> eventsFuture = CompletableFuture.supplyAsync(() -> {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            if (garminConnected) {
                // Refresh the requested range from Intervals so events added,
                // edited or deleted later (Garmin sync, other sources) reach
                // the mirror — same pattern as the activities mirror sync.
                try {
                    JsonNode fetched = intervalsApi.getJson(client,
                            uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/events")
                                    .queryParam("oldest", oldest).queryParam("newest", newest)
                                    .build(athleteId));
                    if (fetched != null && fetched.isArray()) {
                        var keepIds = new java.util.HashSet<String>();
                        fetched.forEach(e -> keepIds.add(e.path("id").asText()));
                        intervalsMirrorService.saveEvents(ctx.user.getId(), fetched);
                        intervalsMirrorService.pruneEvents(ctx.user.getId(), from, to, keepIds);
                    }
                } catch (Exception e) {
                    log.debug("Events mirror refresh failed: {}", e.getMessage());
                }
                log.debug("SOURCE=DB user {} events served from local mirror", ctx.user.getUsername());
                var rows = intervalsEventRepository
                        .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(ctx.user.getId(), from, to);
                var arr = com.sgen.util.JsonPayloads.toPayloadArray(
                        rows, r -> r.getPayloadJson(), objectMapper);
                return arr;
            }
            try {
                return intervalsApi.getJson(client,
                        uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/events")
                                .queryParam("oldest", oldest).queryParam("newest", newest)
                                .build(athleteId));
            } catch (Exception e) {
                log.error("Failed to fetch events: {}", e.getMessage(), e);
                return null;
            }
        }, executorService);

        // Wait for all four independent top-level fetches
        try {
            CompletableFuture.allOf(activitiesFuture, athleteFuture, sportSettingsFuture, eventsFuture).join();
            allData.put("activities", activitiesFuture.getNow(null));
            allData.put("athlete", athleteFuture.getNow(null));
            allData.put("sportSettings", sportSettingsFuture.getNow(null));
            if (garminConnected) {
                JsonNode a = (JsonNode) allData.get("athlete");
                JsonNode ss = (JsonNode) allData.get("sportSettings");
                if (a != null) intervalsMirrorService.saveDoc(ctx.user.getId(), "athlete", a);
                if (ss != null) intervalsMirrorService.saveDoc(ctx.user.getId(), "sportSettings", ss);
            }
            allData.put("events", eventsFuture.getNow(null));
        } catch (Exception e) {
            log.error("Failed to fetch dashboard data: {}", e.getMessage(), e);
        }

        // FTP / VO2Max analysis — only runs for the Statistics/Search view,
        // not on plain dashboard/fitness-period fetches.
        if (analyze) try {
            JsonNode activitiesNode = (JsonNode) allData.get("activities");
            JsonNode athleteNode = (JsonNode) allData.get("athlete");
            if (activitiesNode != null && activitiesNode.isArray() && athleteNode != null) {
                double tempWeight = athleteNode.path("icu_weight").asDouble(0);
                if (tempWeight <= 0) tempWeight = athleteNode.path("weight").asDouble(0);
                final double weightKg = tempWeight;

                // Activities already analyzed (stored in activity_analysis)
                // are skipped permanently — analysis runs once at storage time.
                analyzed.addAll(activityAnalysisService.findAnalyzedIds(ctx.user.getId()));

                Map<String, CompletableFuture<ActivityProcessingResult>> futuresById = new HashMap<>();
                Map<String, JsonNode> activityById = new HashMap<>();
                for (JsonNode activity : activitiesNode) {
                    final String actId = activity.path("id").asText();
                    if (actId.isEmpty() || analyzed.contains(actId)) continue;
                    activityById.put(actId, activity);
                    final JsonNode cachedIntervals = activity.path("icu_intervals").isArray()
                            ? activity.path("icu_intervals") : null;
                    final JsonNode cachedStreams = streamsMap.get(actId);
                    futuresById.put(actId, CompletableFuture.supplyAsync(
                            () -> analysisService.processActivity(client, actId, weightKg, cachedIntervals, cachedStreams), executorService));
                }
                if (!futuresById.isEmpty()) {
                    log.info("Queuing stream analysis for {} unanalyzed activities (FTP/VO2)", futuresById.size());
                    activityAnalysisService.submit(() -> {
                        try {
                            CompletableFuture.allOf(futuresById.values().toArray(new CompletableFuture[0])).join();
                            for (var entry : futuresById.entrySet()) {
                                try {
                                    String actId = entry.getKey();
                                    JsonNode activity = activityById.get(actId);
                                    ActivityProcessingResult result = entry.getValue().get();
                                    analyzed.add(actId);

                                    // Metadata comes from the activity list node — reliable
                                    // even when processActivity used cached intervals.
                                    String actName = activity.path("name").asText("");
                                    String actType = activity.path("type").asText("");
                                    String ds = activity.path("start_date_local").asText("");
                                    java.time.LocalDate actDate = ds.length() >= 10
                                            ? java.time.LocalDate.parse(ds.substring(0, 10)) : null;
                                    boolean indoor = activity.path("trainer").asBoolean(false)
                                            || actType.startsWith("Virtual");
                                    double best5 = result != null ? result.best5minAvg : 0;
                                    activityAnalysisService.recordResult(ctx.user.getId(), username, actId,
                                            actName, actType, actDate, indoor, weightKg, best5);
                                } catch (Exception ignored) {}
                            }
                        } catch (Exception e) {
                            log.error("Background FTP/VO2 analysis failed: {}", e.getMessage(), e);
                        }
                    });
                }
            }
        } catch (Exception e) {
            log.error("Failed to calculate FTP/VO2Max: {}", e.getMessage(), e);
        }

        // Merge locally stored Garmin activities + feed the local fitness model
        try {
            Long uid = ctx.user.getId();
            JsonNode acts = (JsonNode) allData.get("activities");
            recordTrailingLoadDays(uid, ctx, oldest, newest);
            fitnessModelService.recordIntervalsLoads(uid, acts);
            var wellnessMirror = objectMapper.createArrayNode();
            for (var m : intervalsMirrorService.findWellnessPayloads(uid,
                    java.time.LocalDate.now().minusDays(400), java.time.LocalDate.now())) {
                wellnessMirror.add(objectMapper.valueToTree(m));
            }
            fitnessModelService.seedFromIntervalsWellness(uid, wellnessMirror);
            garminMergeService.mergeActivities(uid, acts);
            fitnessModelService.rebuildGarminLoads(uid, (JsonNode) allData.get("activities"));
        } catch (Exception e) {
            log.warn("Garmin merge skipped: {}", e.getMessage());
        }

        allData.put("fetchedAt", java.time.LocalDateTime.now().toString());
        allData.put("dateRange", Map.of("oldest", oldest, "newest", newest));
        allData.put("athleteId", athleteId);
        return allData;
    }

    /** Trailing days the local fitness model always keeps current — the
     *  requested stats window may end before today, but Intervals counts
     *  today's load continuously, so the local EMA must too. */
    private static final int TRAILING_LOAD_DAYS = 14;

    /**
     * Fetch an athlete-related document (profile or sport settings) with the
     * shared mirror policy: fresh mirror &lt; 24h → DB, else API → persist for
     * Garmin-connected users, falling back to the stale mirror on API failure.
     */
    private JsonNode fetchMirroredDoc(ApiContext ctx, boolean garminConnected, String docKey,
                                      String apiPath, java.util.function.BiConsumer<Long, String> persist,
                                      String label) {
        Long uid = ctx.user.getId();
        String username = ctx.user.getUsername();
        if (garminConnected && intervalsMirrorService.athleteMirrorFresh(uid, 24)) {
            String cached = intervalsMirrorService.findAthleteJson(uid, docKey);
            if (cached != null) {
                try {
                    log.debug("SOURCE=DB user {} {} served from local mirror", username, label);
                    return objectMapper.readTree(cached);
                } catch (Exception ignored) {}
            }
        }
        log.debug("SOURCE=INTERVALS user {} fetching {}", username, label);
        try {
            String json = intervalsApi.getString(ctx.client, apiPath, ctx.user.getIntervalsAthleteId());
            if (garminConnected && json != null) persist.accept(uid, json);
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch {}: {}", label, e.getMessage(), e);
            if (garminConnected) {
                String cached = intervalsMirrorService.findAthleteJson(uid, docKey);
                if (cached != null) {
                    try {
                        log.debug("SOURCE=DB user {} stale {} served from local mirror", username, label);
                        return objectMapper.readTree(cached);
                    } catch (Exception ignored) {}
                }
            }
            return null;
        }
    }

    /**
     * Feed the last TRAILING_LOAD_DAYS of activities into the local daily-load
     * table whenever the requested stats window does not fully cover them.
     * Mirror rows serve Garmin-connected users; others get one extra API call.
     */
    private void recordTrailingLoadDays(Long uid, ApiContext ctx, String oldest, String newest) {
        try {
            java.time.LocalDate tail = java.time.LocalDate.now().minusDays(TRAILING_LOAD_DAYS);
            java.time.LocalDate today = java.time.LocalDate.now();
            java.time.LocalDate from = java.time.LocalDate.parse(oldest);
            java.time.LocalDate to = java.time.LocalDate.parse(newest);
            if (!from.isAfter(tail) && !to.isBefore(today)) return; // window already covers the tail

            ArrayNode recent = objectMapper.createArrayNode();
            if (garminClientFactory.isConnected(uid)) {
                for (var row : intervalsActivityRepository
                        .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(
                                uid, tail.atStartOfDay(), today.plusDays(1).atStartOfDay())) {
                    try {
                        recent.add(objectMapper.readTree(row.getPayloadJson()));
                    } catch (Exception e) {
                        log.debug("Mirror activity parse for trailing loads: {}", e.getMessage());
                    }
                }
            } else {
                JsonNode arr = intervalsApi.getJson(ctx.client,
                        uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                                .queryParam("oldest", tail.toString())
                                .queryParam("newest", today.toString())
                                .build(ctx.user.getIntervalsAthleteId()));
                if (arr != null && arr.isArray()) recent.addAll((ArrayNode) arr);
            }
            if (!recent.isEmpty()) {
                fitnessModelService.recordIntervalsLoads(uid, recent);
            }
        } catch (Exception e) {
            log.warn("Trailing load days recording failed: {}", e.getMessage(), e);
        }
    }

    // -------------------------------------------------------------------------
    // Activity details & images
    // -------------------------------------------------------------------------

    public Map<String, Object> getActivityDetails(String username, String activityId) {
        return activityDetailService.getActivityDetails(username, activityId);
    }

    public byte[] getActivityMapImage(String username, String activityId) {
        return intervalsImageService.getActivityMapImage(username, activityId);
    }

    public byte[] getActivityChartImage(String username, String activityId) {
        return intervalsImageService.getActivityChartImage(username, activityId);
    }

    // -------------------------------------------------------------------------
    // Activity mutations
    // -------------------------------------------------------------------------

    public Map<String, Object> updateActivity(String username, String activityId, Map<String, Object> updates) {
        return activityOpsService.updateActivity(username, activityId, updates);
    }

    public void deleteActivity(String username, String activityId) {
        activityOpsService.deleteActivity(username, activityId);
    }

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        return intervalsIntervalService.fetchActivityBestEfforts(username, activityId);
    }

    public JsonNode findBestEfforts(String username, String activityId, String stream,
                                    Integer duration, Integer count, Float minValue,
                                    Boolean excludeIntervals) {
        return intervalsIntervalService.findBestEfforts(username, activityId, stream, duration, count, minValue, excludeIntervals);
    }

    public List<Map<String, Object>> computeIntervalsFromStreams(String username, String activityId,
                                                                  String stream, Integer duration, Integer count,
                                                                  Integer skipSeconds, Integer cooldownSeconds) {
        return intervalsIntervalService.computeIntervalsFromStreams(username, activityId, stream, duration, count, skipSeconds, cooldownSeconds);
    }

    public JsonNode updateActivityIntervals(String username, String activityId,
                                            List<Map<String, Object>> intervals,
                                            Integer searchDuration) {
        return activityOpsService.updateActivityIntervals(username, activityId, intervals, searchDuration);
    }

    public Map<String, Object> extractIntervalSummary(JsonNode icuIntervals) {
        return intervalsIntervalService.extractIntervalSummary(icuIntervals);
    }

    public JsonNode uploadActivity(String username, MultipartFile file, String name, String description) {
        return activityOpsService.uploadActivity(username, file, name, description);
    }

    public JsonNode getPowerCurveHistory(String username, String oldest, String newest, String type) {
        return statsService.getPowerCurveHistory(username, oldest, newest, type);
    }

    public JsonNode getTrainingTotalsActivities(String username, String oldest, String newest) {
        return statsService.getTrainingTotalsActivities(username, oldest, newest);
    }

    public boolean testConnection(String username) {
        return statsService.testConnection(username);
    }

    public Map<String, Object> getTrainingPreferences(String username) {
        return statsService.getTrainingPreferences(username);
    }

    public void saveTrainingPreferences(String username, Map<String, Object> preferences) {
        statsService.saveTrainingPreferences(username, preferences);
    }
}