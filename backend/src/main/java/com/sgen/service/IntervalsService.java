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
            log.info("fetchAllData user {} {}-{}: {} ms, {} KB payload, analyze={}",
                    username, oldest, newest, System.currentTimeMillis() - t0, bytes / 1024, analyze);
        } catch (Exception e) {
            log.info("fetchAllData user {} {}-{}: {} ms",
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
                log.info("SOURCE=DB user {} events served from local mirror", ctx.user.getUsername());
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
                    log.info("SOURCE=DB user {} {} served from local mirror", username, label);
                    return objectMapper.readTree(cached);
                } catch (Exception ignored) {}
            }
        }
        log.info("SOURCE=INTERVALS user {} fetching {}", username, label);
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
                        log.info("SOURCE=DB user {} stale {} served from local mirror", username, label);
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
        ApiContext ctx = getValidatedContext(username);
        WebClient client = ctx.client;
        Map<String, Object> details = new HashMap<>();
        Long uid = ctx.user.getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);

        // Garmin-connected: serve from the local mirror when the row exists —
        // no Intervals calls at all.
        if (garminConnected) {
            var mirrorRow = intervalsActivityRepository.findByUserIdAndActivityId(uid, activityId);
            if (mirrorRow.isPresent()) {
                log.info("SOURCE=DB user {} activity {} details served from local mirror", username, activityId);
                return mirrorActivityDetails(uid, activityId, mirrorRow.get(), client);
            }
        }

        try {
            JsonNode activityNode = intervalsApi.getJson(client,
                    uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                            .queryParam("intervals", "true").build(activityId));
            details.put("activity", activityNode);
        } catch (Exception e) {
            log.error("Failed to fetch activity {}: {}", activityId, e.getMessage(), e);
            details.put("activityError", e.getMessage());
        }

        try {
            JsonNode[] streamsNodeRef = new JsonNode[1];
            streamsNodeRef[0] = intervalsApi.getJson(client, "/api/v1/activity/{id}/streams", activityId);
            JsonNode streamsNode = streamsNodeRef[0];
            details.put("streams", streamsNode);
            
            // Log available streams for debugging and handle both formats
            List<String> availableStreams = new ArrayList<>();
            Map<String, JsonNode> streamsMap = new HashMap<>();
            
            if (streamsNodeRef[0].isObject()) {
                // Object format: {"velocity_smooth": [...], "distance": [...]}
                streamsNodeRef[0].fieldNames().forEachRemaining(field -> {
                    availableStreams.add(field);
                    streamsMap.put(field, streamsNodeRef[0].get(field));
                });
                log.debug("Streams object format for {} with fields: {}", activityId, availableStreams);
                com.sgen.service.garmin.GpsTrackTrimmer.trimNormalized(streamsNodeRef[0]);
            } else if (streamsNodeRef[0].isArray()) {
                // Array format: [{"type": "velocity", "data": [...]}, ...]
                log.debug("Streams array format for {} with {} elements", activityId, streamsNodeRef[0].size());
                for (JsonNode streamElement : streamsNodeRef[0]) {
                    String type = streamElement.path("type").asText("");
                    if (!type.isEmpty()) {
                        availableStreams.add(type);
                        // Store the data array directly
                        if (streamElement.has("data")) {
                            streamsMap.put(type, streamElement.get("data"));
                        }
                    }
                }
                log.debug("Available stream types in array: {}", availableStreams);
                
                // Create a wrapper object for the pace calculation to use
                ObjectNode streamsWrapper = objectMapper.createObjectNode();
                for (Map.Entry<String, JsonNode> entry : streamsMap.entrySet()) {
                    streamsWrapper.set(entry.getKey(), entry.getValue());
                }
                // Replace the array with our wrapper object for easier processing
                com.sgen.service.garmin.GpsTrackTrimmer.trimNormalized(streamsWrapper);
                details.put("streams", streamsWrapper);
                streamsNodeRef[0] = streamsWrapper;
            }
            
        } catch (Exception e) {
            log.warn("Failed to fetch streams for {}: {}", activityId, e.getMessage());
        }

        // Enrich intervals with start/end HR and HRR from streams (must run after streams are fetched)
        JsonNode activityNodeForIntervals = (JsonNode) details.get("activity");
        if (activityNodeForIntervals != null && activityNodeForIntervals.has("icu_intervals")) {
            JsonNode intervals = activityNodeForIntervals.get("icu_intervals");
            com.sgen.util.IntervalEnrichment.enrich(intervals, (JsonNode) details.get("streams"));
            details.put("intervalSummary", analysisService.extractIntervalSummary(intervals));
            Map<String, Object> intervalsWrapper = new HashMap<>();
            intervalsWrapper.put("icu_intervals", intervals);
            details.put("intervals", intervalsWrapper);
        }

        try {
            details.put("powerCurve",
                    intervalsApi.getJson(client, "/api/v1/activity/{id}/power-curve", activityId));
        } catch (Exception e) {
            log.warn("Failed to fetch power curve for {}: {}", activityId, e.getMessage());
        }

        // Fetch map data (latlngs for the map)
        try {
            String mapJson = intervalsApi.getString(client, "/api/v1/activity/{id}/map", activityId);
            if (mapJson != null && !mapJson.isEmpty()) {
                JsonNode mapData = objectMapper.readTree(mapJson);
                if (mapData instanceof com.fasterxml.jackson.databind.node.ObjectNode mo
                        && mo.get("latlngs") != null) {
                    com.sgen.service.garmin.GpsTrackTrimmer.trimLatlngs(mo.get("latlngs"));
                }
                details.put("mapData", mapData);
            }
        } catch (Exception e) {
            log.debug("No map data available for activity {}: {}", activityId, e.getMessage());
        }

        addPaceCurve(activityId, details, (JsonNode) details.get("streams"));

        // Garmin-connected: keep the mirror warm so the next view is fully local.
        if (garminConnected) {
            try {
                JsonNode act = (JsonNode) details.get("activity");
                if (act != null) intervalsMirrorService.saveActivity(uid, act);
                intervalsMirrorService.saveStreams(uid, activityId,
                        (JsonNode) details.get("streams"),
                        act != null ? act.get("icu_intervals") : null);
            } catch (Exception e) {
                log.debug("Mirror persist on details failed: {}", e.getMessage());
            }
        }

        return details;
    }

    /** Same details shape as the API path, built entirely from mirror rows. */
    private Map<String, Object> mirrorActivityDetails(Long uid, String activityId,
                                                      com.sgen.entity.IntervalsActivity row,
                                                      WebClient client) {
        Map<String, Object> details = new HashMap<>();
        try {
            ObjectNode activity = (ObjectNode) objectMapper.readTree(row.getPayloadJson());
            details.put("activity", activity);
            var srow = intervalsStreamsRepository.findByUserIdAndActivityId(uid, activityId).orElse(null);
            JsonNode streams = null, intervals = null;
            if (srow != null) {
                try { if (srow.getStreamsJson() != null && !srow.getStreamsJson().isBlank())
                        streams = objectMapper.readTree(srow.getStreamsJson()); }
                catch (Exception e) { log.debug("mirror streams parse {}", e.getMessage()); }
                try { if (srow.getIntervalsJson() != null && !srow.getIntervalsJson().isBlank())
                        intervals = objectMapper.readTree(srow.getIntervalsJson()); }
                catch (Exception e) { log.debug("mirror intervals parse {}", e.getMessage()); }
                if (intervals != null && intervals.isObject() && intervals.has("icu_intervals"))
                    intervals = intervals.get("icu_intervals");
            }
            // Missing pieces: fetch once from Intervals and persist into the mirror.
            boolean intsMissing = intervals == null || (intervals.isArray() && intervals.isEmpty());
            if (streams == null || intsMissing) {
                if (intsMissing) intervals = null;
                try {
                    if (streams == null) {
                        streams = intervalsApi.getJson(client, "/api/v1/activity/{id}/streams", activityId);
                    }
                    if (intervals == null) {
                        JsonNode det = intervalsApi.getJson(client,
                                b -> b.path("/api/v1/activity/{id}")
                                        .queryParam("intervals", "true").build(activityId));
                        if (det.has("icu_intervals")) intervals = det.get("icu_intervals");
                    }
                    intervalsMirrorService.saveStreams(uid, activityId, streams, intervals);
                    log.info("Mirror for {} was missing streams/intervals — fetched and persisted", activityId);
                } catch (Exception e) {
                    log.debug("Mirror streams heal for {} failed: {}", activityId, e.getMessage());
                }
            }
            ObjectNode normalized = normalizeStreams(streams);
            if (normalized != null) {
                com.sgen.service.garmin.GpsTrackTrimmer.trimNormalized(normalized);
                details.put("streams", normalized);
                details.put("powerCurve", com.sgen.service.garmin.CurveCalculator.curve(normalized.get("watts")));
                details.put("hrCurve", com.sgen.service.garmin.CurveCalculator.curve(normalized.get("heartrate")));
            }
            // Mirror streams lack a usable latlng payload — fetch the /map payload instead.
            if (!details.containsKey("mapData")) {
                try {
                    String mapJson = intervalsApi.getString(client, "/api/v1/activity/{id}/map", activityId);
                    if (mapJson != null && !mapJson.isEmpty()) {
                        JsonNode mapData = objectMapper.readTree(mapJson);
                        if (mapData instanceof com.fasterxml.jackson.databind.node.ObjectNode mo
                                && mo.get("latlngs") != null) {
                            com.sgen.service.garmin.GpsTrackTrimmer.trimLatlngs(mo.get("latlngs"));
                        }
                        details.put("mapData", mapData);
                    }
                } catch (Exception e) {
                    log.debug("Map fetch for {} failed: {}", activityId, e.getMessage());
                }
            }
            if (intervals != null) {
                com.sgen.util.IntervalEnrichment.enrich(intervals, normalized);
                activity.set("icu_intervals", intervals);
                details.put("intervalSummary", analysisService.extractIntervalSummary(intervals));
                details.put("intervals", Map.of("icu_intervals", intervals));
            }
            addPaceCurve(activityId, details, normalized);
        } catch (Exception e) {
            log.warn("Mirror details for {} failed: {}", activityId, e.getMessage());
        }
        return details;
    }

    /** Normalize Intervals streams (array [{type,data}] or object) to {type→data}. */
    private ObjectNode normalizeStreams(JsonNode streams) {
        return com.sgen.service.garmin.CurveCalculator.normalizeStreams(streams);
    }

    /** Pace curve for running activities, shared by the API and mirror paths. */
    private void addPaceCurve(String activityId, Map<String, Object> details, JsonNode streamsNode) {
        try {
            JsonNode activityNode = (JsonNode) details.get("activity");
            if (activityNode == null || streamsNode == null) return;
            String type = activityNode.path("type").asText("");
            if (!isRunningActivity(type)) return;
            if (!(streamsNode.has("velocity_smooth") || streamsNode.has("distance")
                    || streamsNode.has("watts") || streamsNode.has("pace"))) return;
            Map<Integer, Double> paceCurve = calculatePaceFromStreams(streamsNode);
            if (paceCurve.isEmpty()) return;
            Map<String, Object> paceResult = new HashMap<>();
            paceResult.put("activityId", activityId);
            paceResult.put("activityName", activityNode.path("name").asText(""));
            String dateStr = activityNode.path("start_date_local").asText("");
            paceResult.put("activityDate", dateStr.length() >= 10 ? dateStr.substring(0, 10) : dateStr);
            paceResult.put("sportType", type);
            paceResult.put("paceData", paceCurve);
            paceResult.put("totalDistance", activityNode.path("distance").asDouble(0));
            paceResult.put("totalTime", activityNode.path("moving_time").asInt(0));
            details.put("paceCurve", paceResult);
        } catch (Exception e) {
            log.error("Failed to calculate pace curve for {}: {}", activityId, e.getMessage(), e);
        }
    }

    /**
     * Check if activity type is a running activity
     */
    private boolean isRunningActivity(String type) {
        if (type == null) return false;
        String lower = type.toLowerCase();
        return lower.contains("run") || lower.contains("trail") || lower.contains("hike") || 
               lower.equals("virtualrun");
    }

    /**
     * Enrich interval objects using activity streams:
     * - start_hr: heart rate at the interval start index.
     * - hrr: heart rate recovery after a WORK interval, measured as the drop in
     *        average HR from the end of the work interval to ~60 seconds into
     *        the following RECOVERY/REST interval.
     * Requires streams with heart rate (heartrate) and time channels, in either
     * array or object format.
     */


    /**
     * Extract a double-valued stream from either array or object format.
     */

    /**
     * Calculate pace (m/s) for each duration checkpoint using velocity data.
     * Falls back to calculating from distance stream if velocity_smooth is not available.
     */
    private Map<Integer, Double> calculatePaceFromStreams(JsonNode streamsNode) {
        Map<Integer, Double> paceData = new LinkedHashMap<>();
        
        if (streamsNode == null) {
            return paceData;
        }
        
        // Standard durations for pace curve (in seconds)
        int[] durations = {30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 10800};
        
        // Try velocity_smooth first
        if (streamsNode.has("velocity_smooth")) {
            JsonNode velocityNode = streamsNode.get("velocity_smooth");
            if (velocityNode != null && velocityNode.isArray() && velocityNode.size() > 0) {
                return calculatePaceFromVelocity(velocityNode, durations);
            }
        }
        
        // Fallback: calculate from distance stream
        if (streamsNode.has("distance")) {
            JsonNode distanceNode = streamsNode.get("distance");
            if (distanceNode != null && distanceNode.isArray() && distanceNode.size() > 0) {
                return calculatePaceFromDistance(distanceNode, durations);
            }
        }
        
        return paceData;
    }
    
    /**
     * Calculate pace from velocity_smooth stream
     */
    private Map<Integer, Double> calculatePaceFromVelocity(JsonNode velocityNode, int[] durations) {
        Map<Integer, Double> paceData = new LinkedHashMap<>();
        int dataPoints = velocityNode.size();
        double[] velocities = new double[dataPoints];
        for (int i = 0; i < dataPoints; i++) {
            velocities[i] = velocityNode.get(i).asDouble(0);
        }
        
        for (int duration : durations) {
            if (duration > dataPoints) {
                continue;
            }
            
            double bestAvgVelocity = 0;
            
            for (int start = 0; start <= dataPoints - duration; start++) {
                double sum = 0;
                for (int i = start; i < start + duration; i++) {
                    sum += velocities[i];
                }
                double avg = sum / duration;
                if (avg > bestAvgVelocity) {
                    bestAvgVelocity = avg;
                }
            }
            
            if (bestAvgVelocity > 0) {
                paceData.put(duration, bestAvgVelocity);
            }
        }
        
        return paceData;
    }
    
    /**
     * Calculate pace from distance stream (fallback when velocity is not available)
     */
    private Map<Integer, Double> calculatePaceFromDistance(JsonNode distanceNode, int[] durations) {
        Map<Integer, Double> paceData = new LinkedHashMap<>();
        int dataPoints = distanceNode.size();
        
        // Convert distance to velocity (derivative of distance = velocity)
        double[] distances = new double[dataPoints];
        for (int i = 0; i < dataPoints; i++) {
            distances[i] = distanceNode.get(i).asDouble(0);
        }
        
        for (int duration : durations) {
            if (duration > dataPoints) {
                continue;
            }
            
            double bestAvgVelocity = 0;
            
            // Sliding window - calculate velocity from distance difference
            for (int start = 0; start <= dataPoints - duration; start++) {
                double distanceDiff = distances[start + duration - 1] - distances[start];
                double avgVelocity = distanceDiff / duration; // m/s
                
                if (avgVelocity > bestAvgVelocity) {
                    bestAvgVelocity = avgVelocity;
                }
            }
            
            if (bestAvgVelocity > 0) {
                paceData.put(duration, bestAvgVelocity);
            }
        }
        
        return paceData;
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
        ApiContext ctx = getValidatedContext(username);
        try {
            String responseJson = ctx.client.put()
                    .uri("/api/v1/activity/{id}", activityId)
                    .bodyValue(updates)
                    .retrieve().bodyToMono(String.class).block();
            @SuppressWarnings("unchecked")
            Map<String, Object> result = objectMapper.readValue(responseJson, Map.class);
            if (garminClientFactory.isConnected(ctx.user.getId())) {
                try {
                    intervalsMirrorService.saveActivity(ctx.user.getId(), objectMapper.readTree(responseJson));
                } catch (Exception e) {
                    log.debug("Mirror persist updated activity {} failed: {}", activityId, e.getMessage());
                }
            }
            if (updates.containsKey("type")) {
                log.info("Activity {} type changed to {} — resetting analysis for recompute",
                        activityId, updates.get("type"));
                activityAnalysisService.resetForTypeChange(ctx.user.getId(), activityId);
            }
            return result;
        } catch (Exception e) {
            log.error("Failed to update activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to update activity: " + e.getMessage());
        }
    }

    public void deleteActivity(String username, String activityId) {
        ApiContext ctx = getValidatedContext(username);
        try {
            ctx.client.delete()
                    .uri("/api/v1/activity/{activityId}", activityId)
                    .retrieve().bodyToMono(Void.class).block();
            // Keep the mirror consistent so the activity doesn't reappear.
            Long uid = ctx.user.getId();
            if (garminClientFactory.isConnected(uid)) {
                intervalsActivityRepository.findByUserIdAndActivityId(uid, activityId)
                        .ifPresent(act -> {
                            if (act.getStartDateLocal() != null) {
                                intervalsMirrorService.deleteIntervalsDailyLoad(
                                        uid, act.getStartDateLocal().toLocalDate());
                            }
                            intervalsActivityRepository.delete(act);
                        });
                intervalsStreamsRepository.findByUserIdAndActivityId(uid, activityId)
                        .ifPresent(intervalsStreamsRepository::delete);
            }
            // Drop analysis + every result the activity produced (FTP/VO2
            // top-3, records, achievements) — they are not rebuilt.
            activityAnalysisService.purgeForDeletedActivity(uid, activityId);
        } catch (Exception e) {
            log.error("Failed to delete activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to delete activity: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Interval & best-effort — delegate to analysis service
    // -------------------------------------------------------------------------

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        return analysisService.fetchActivityBestEfforts(username, activityId);
    }

    public JsonNode findBestEfforts(String username, String activityId, String stream,
                                    Integer duration, Integer count, Float minValue,
                                    Boolean excludeIntervals) {
        return analysisService.findBestEfforts(username, activityId, stream, duration, count, minValue, excludeIntervals);
    }

    public List<Map<String, Object>> computeIntervalsFromStreams(String username, String activityId,
                                                                  String stream, Integer duration, Integer count,
                                                                  Integer skipSeconds, Integer cooldownSeconds) {
        return analysisService.computeIntervalsFromStreams(username, activityId, stream, duration, count, skipSeconds, cooldownSeconds);
    }

    public JsonNode updateActivityIntervals(String username, String activityId,
                                            List<Map<String, Object>> intervals,
                                            Integer searchDuration) {
        try {
            Map<String, Object> details = getActivityDetails(username, activityId);
            JsonNode activityNode = (JsonNode) details.get("activity");
            JsonNode streamsNode = (JsonNode) details.get("streams");
            JsonNode result = analysisService.updateActivityIntervals(username, activityId, intervals, searchDuration, activityNode, streamsNode);
            // Enrich the returned intervals with start/end HR and HRR so the values
            // are available immediately without refetching activity details.
            if (result != null) {
                JsonNode resultIntervals = result.isArray() ? result : result.path("icu_intervals");
                if (resultIntervals.isArray()) {
                    com.sgen.util.IntervalEnrichment.enrich(resultIntervals, streamsNode);
                }
            }
            return result;
        } catch (Exception e) {
            log.error("Failed to update intervals for activity {}: {}", activityId, e.getMessage(), e);
            throw new RuntimeException("Failed to update intervals: " + e.getMessage());
        }
    }

    public Map<String, Object> extractIntervalSummary(JsonNode icuIntervals) {
        return analysisService.extractIntervalSummary(icuIntervals);
    }

    // -------------------------------------------------------------------------
    // Upload
    // -------------------------------------------------------------------------

    public JsonNode uploadActivity(String username, MultipartFile file, String name, String description) {
        ApiContext ctx = getValidatedContext(username);
        try {
            byte[] fileBytes = file.getBytes();
            String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "activity.fit";
            MultipartBodyBuilder builder = new MultipartBodyBuilder();
            builder.part("file", new ByteArrayResource(fileBytes) {
                @Override
                public String getFilename() { return originalFilename; }
            }).header("Content-Disposition", "form-data; name=file; filename=" + originalFilename);

            String responseJson = ctx.client.post()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/api/v1/athlete/{athleteId}/activities");
                        if (name != null && !name.isBlank()) uriBuilder.queryParam("name", name);
                        if (description != null && !description.isBlank()) uriBuilder.queryParam("description", description);
                        return uriBuilder.build(ctx.user.getIntervalsAthleteId());
                    })
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                            response -> response.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("API error " + response.statusCode() + ": " + body)))
                    .bodyToMono(String.class).block();

            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to upload activity for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to upload activity: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Power Curve History
    // -------------------------------------------------------------------------

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