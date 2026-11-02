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
    private final IntervalsApiRateLimiter rateLimiter;
    private final IntervalsClientFactory clientFactory;
    private final IntervalsActivityAnalysisService analysisService;
    private final GarminMergeService garminMergeService;
    private final FitnessModelService fitnessModelService;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final com.sgen.repository.IntervalsEventRepository intervalsEventRepository;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;

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

        // Garmin-connected: serve everything from local DB — no Intervals
        // activity/stream/wellness calls at all (pure local pipeline).
        boolean garminConnected = garminClientFactory.isConnected(ctx.user.getId());
        if (garminConnected) {
            log.info("User {} has active Garmin connection — local Garmin activities will take precedence in merge", ctx.user.getUsername());
        }

        // Activities (with per-activity intervals fetched concurrently)
        CompletableFuture<JsonNode> activitiesFuture = CompletableFuture.supplyAsync(() -> {
            if (garminConnected && intervalsActivityRepository.countByUserId(ctx.user.getId()) > 0) {
                // Local mirror: verbatim Intervals payloads stored by backfill
                var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
                var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
                var rows = intervalsActivityRepository
                        .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(ctx.user.getId(), from, to);
                var arr = objectMapper.createArrayNode();
                for (var r : rows) {
                    try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                    catch (Exception e) { log.debug("mirror parse {}", e.getMessage()); }
                }
                log.info("SOURCE=DB user {} activities served from local mirror: {}", ctx.user.getUsername(), arr.size());
                // Hydrate streams/icu_intervals from the mirror so the FTP/VO2 step
                // below needs no Intervals calls. Missing rows are fetched once and
                // persisted — next request is fully local.
                Long uid = ctx.user.getId();
                var ids = new ArrayList<String>();
                for (JsonNode n : arr) {
                    String id = n.path("id").asText("");
                    if (!id.isEmpty()) ids.add(id);
                }
                Map<String, com.sgen.entity.IntervalsActivityStreams> have = new HashMap<>();
                if (!ids.isEmpty()) {
                    for (var s : intervalsStreamsRepository.findByUserIdAndActivityIdIn(uid, ids)) {
                        have.put(s.getActivityId(), s);
                    }
                }
                for (JsonNode n : arr) {
                    String id = n.path("id").asText("");
                    if (id.isEmpty()) continue;
                    var srow = have.get(id);
                    JsonNode str = null, ints = null;
                    if (srow != null) {
                        try { if (srow.getStreamsJson() != null) str = objectMapper.readTree(srow.getStreamsJson()); }
                        catch (Exception e) { log.debug("mirror streams parse {}", e.getMessage()); }
                        try { if (srow.getIntervalsJson() != null) ints = objectMapper.readTree(srow.getIntervalsJson()); }
                        catch (Exception e) { log.debug("mirror intervals parse {}", e.getMessage()); }
                    }
                    if (str == null || ints == null) {
                        try {
                            if (str == null) {
                                rateLimiter.acquire();
                                str = objectMapper.readTree(client.get()
                                        .uri("/api/v1/activity/{id}/streams", id)
                                        .retrieve().bodyToMono(String.class).block());
                            }
                            if (ints == null) {
                                rateLimiter.acquire();
                                JsonNode det = objectMapper.readTree(client.get()
                                        .uri(b -> b.path("/api/v1/activity/{id}")
                                                .queryParam("intervals", "true").build(id))
                                        .retrieve().bodyToMono(String.class).block());
                                if (det.has("icu_intervals")) ints = det.get("icu_intervals");
                                if (det.has("icu_max_watts") && !n.has("icu_max_watts")
                                        && n instanceof ObjectNode on) {
                                    on.set("icu_max_watts", det.get("icu_max_watts"));
                                }
                            }
                            intervalsMirrorService.saveStreams(uid, id, str, ints);
                        } catch (Exception e) {
                            log.debug("Mirror streams fetch for {} failed: {}", id, e.getMessage());
                        }
                    }
                    if (ints != null) {
                        enrichIntervalsFromStreams(ints, str);
                        if (n instanceof ObjectNode on) on.set("icu_intervals", ints);
                    }
                    if (str != null) streamsMap.put(id, str);
                }
                return arr;
            }
            try {
                rateLimiter.acquire();
                String activitiesJson = client.get()
                        .uri(uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                                .queryParam("oldest", oldest).queryParam("newest", newest)
                                .build(athleteId))
                        .retrieve().bodyToMono(String.class).block();
                JsonNode activitiesNode = objectMapper.readTree(activitiesJson);

                if (activitiesNode.isArray()) {
                    log.info("SOURCE=INTERVALS user {} fetched {} activities from Intervals API", username, activitiesNode.size());
                    log.info("Fetching interval data for {} activities", activitiesNode.size());
                    List<CompletableFuture<Void>> intervalFutures = new ArrayList<>();
                    for (JsonNode activity : activitiesNode) {
                        String activityId = activity.path("id").asText();
                        String name = activity.path("name").asText("");
                        String type = activity.path("type").asText("");
                        String source = activity.path("source").asText("");
                        if (name.isEmpty() && type.isEmpty() && "STRAVA".equals(source)) {
                            ((com.fasterxml.jackson.databind.node.ObjectNode) activity).put("_strava_restricted", true);
                            continue;
                        }
                        if (activityId == null || activityId.isEmpty()) {
                            continue;
                        }
                        final JsonNode currentActivity = activity;
                        final String currentActivityId = activityId;
                        intervalFutures.add(CompletableFuture.runAsync(() -> {
                            try {
                                rateLimiter.acquire();
                                String detailJson = client.get()
                                        .uri(uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                                                .queryParam("intervals", "true").build(currentActivityId))
                                        .retrieve().bodyToMono(String.class).block();
                                JsonNode details = objectMapper.readTree(detailJson);
                                JsonNode streams = null;
                                try {
                                    rateLimiter.acquire();
                                    String streamsJson = client.get()
                                            .uri("/api/v1/activity/{id}/streams", currentActivityId)
                                            .retrieve().bodyToMono(String.class).block();
                                    streams = objectMapper.readTree(streamsJson);
                                    streamsMap.put(currentActivityId, streams);
                                } catch (Exception e) {
                                    log.debug("Failed to fetch streams for activity {}: {}", currentActivityId, e.getMessage());
                                }
                                if (details.has("icu_intervals")) {
                                    JsonNode intervals = details.get("icu_intervals");
                                    enrichIntervalsFromStreams(intervals, streams);
                                    ((com.fasterxml.jackson.databind.node.ObjectNode) currentActivity)
                                            .set("icu_intervals", intervals);
                                }
                                if (details.has("icu_max_watts") && !currentActivity.has("icu_max_watts")) {
                                    ((com.fasterxml.jackson.databind.node.ObjectNode) currentActivity)
                                            .set("icu_max_watts", details.get("icu_max_watts"));
                                }
                            } catch (Exception e) {
                                log.warn("Failed to fetch intervals for activity {}: {}", currentActivityId, e.getMessage());
                            }
                        }, executorService));
                    }
                    CompletableFuture.allOf(intervalFutures.toArray(new CompletableFuture[0])).join();
                    log.info("Completed fetching interval data for all activities");
                    // Garmin-connected but mirror empty: persist everything locally
                    // so subsequent requests are served from the DB mirror.
                    if (garminConnected) {
                        Long uid = ctx.user.getId();
                        for (JsonNode activity : activitiesNode) {
                            intervalsMirrorService.saveActivity(uid, activity);
                            String actId = activity.path("id").asText("");
                            intervalsMirrorService.saveStreams(uid, actId,
                                    streamsMap.get(actId), activity.get("icu_intervals"));
                        }
                        log.info("Mirror was empty for user {} — persisted {} activities + streams to local mirror",
                                ctx.user.getUsername(), activitiesNode.size());
                    }
                }
                return activitiesNode;
            } catch (Exception e) {
                log.error("Failed to fetch activities: {}", e.getMessage(), e);
                return null;
            }
        }, executorService);

        // Athlete profile
        CompletableFuture<JsonNode> athleteFuture = CompletableFuture.supplyAsync(() -> {
            if (garminConnected && intervalsMirrorService.athleteMirrorFresh(ctx.user.getId(), 24)) {
                String cached = intervalsMirrorService.findAthleteJson(ctx.user.getId(), "athlete");
                if (cached != null) {
                    try {
                        log.info("SOURCE=DB user {} athlete profile served from local mirror", username);
                        return objectMapper.readTree(cached);
                    } catch (Exception ignored) {}
                }
            }
            log.info("SOURCE=INTERVALS user {} fetching athlete profile", username);
            try {
                rateLimiter.acquire();
                String athleteJson = client.get().uri("/api/v1/athlete/{id}", athleteId)
                        .retrieve().bodyToMono(String.class).block();
                if (garminConnected && athleteJson != null) {
                    intervalsMirrorService.saveAthleteProfile(ctx.user.getId(), athleteJson, null);
                }
                return objectMapper.readTree(athleteJson);
            } catch (Exception e) {
                log.error("Failed to fetch athlete profile: {}", e.getMessage(), e);
                return null;
            }
        }, executorService);

        // Sport settings
        CompletableFuture<JsonNode> sportSettingsFuture = CompletableFuture.supplyAsync(() -> {
            if (garminConnected && intervalsMirrorService.athleteMirrorFresh(ctx.user.getId(), 24)) {
                String cached = intervalsMirrorService.findAthleteJson(ctx.user.getId(), "sport-settings");
                if (cached != null) {
                    try {
                        log.info("SOURCE=DB user {} sport settings served from local mirror", username);
                        return objectMapper.readTree(cached);
                    } catch (Exception ignored) {}
                }
            }
            log.info("SOURCE=INTERVALS user {} fetching sport settings", username);
            try {
                rateLimiter.acquire();
                String sportSettingsJson = client.get().uri("/api/v1/athlete/{id}/sport-settings", athleteId)
                        .retrieve().bodyToMono(String.class).block();
                if (garminConnected && sportSettingsJson != null) {
                    intervalsMirrorService.saveAthleteProfile(ctx.user.getId(), null, sportSettingsJson);
                }
                return objectMapper.readTree(sportSettingsJson);
            } catch (Exception e) {
                log.error("Failed to fetch sport settings: {}", e.getMessage(), e);
                return null;
            }
        }, executorService);

        // Events
        CompletableFuture<JsonNode> eventsFuture = CompletableFuture.supplyAsync(() -> {
            if (garminConnected && intervalsEventRepository.countByUserId(ctx.user.getId()) > 0) {
                log.info("SOURCE=DB user {} events served from local mirror", ctx.user.getUsername());
                var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
                var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
                var rows = intervalsEventRepository
                        .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(ctx.user.getId(), from, to);
                var arr = objectMapper.createArrayNode();
                for (var r : rows) {
                    try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                    catch (Exception e) { log.debug("mirror event parse {}", e.getMessage()); }
                }
                return arr;
            }
            try {
                rateLimiter.acquire();
                String eventsJson = client.get()
                        .uri(uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/events")
                                .queryParam("oldest", oldest).queryParam("newest", newest)
                                .build(athleteId))
                        .retrieve().bodyToMono(String.class).block();
                JsonNode events = objectMapper.readTree(eventsJson);
                // Garmin-connected but mirror empty: persist events locally too.
                if (garminConnected) {
                    intervalsMirrorService.saveEvents(ctx.user.getId(), events);
                }
                return events;
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
            allData.put("events", eventsFuture.getNow(null));
        } catch (Exception e) {
            log.error("Failed to fetch dashboard data: {}", e.getMessage(), e);
        }

        // FTP / VO2Max calculation via parallel activity processing
        try {
            JsonNode activitiesNode = (JsonNode) allData.get("activities");
            JsonNode athleteNode = (JsonNode) allData.get("athlete");
            if (activitiesNode != null && activitiesNode.isArray() && athleteNode != null) {
                double tempWeight = athleteNode.path("icu_weight").asDouble(0);
                if (tempWeight <= 0) tempWeight = athleteNode.path("weight").asDouble(0);
                final double weightKg = tempWeight;

                log.info("Analyzing streams for {} activities (FTP/VO2)", activitiesNode.size());
                List<CompletableFuture<ActivityProcessingResult>> futures = new ArrayList<>();
                Map<String, Boolean> indoorByActivityId = new HashMap<>();
                for (JsonNode activity : activitiesNode) {
                    final String actId = activity.path("id").asText();
                    indoorByActivityId.put(actId,
                            activity.path("trainer").asBoolean(false)
                                    || activity.path("type").asText("").startsWith("Virtual"));
                    final JsonNode cachedIntervals = activity.path("icu_intervals").isArray()
                            ? activity.path("icu_intervals") : null;
                    final JsonNode cachedStreams = streamsMap.get(actId);
                    futures.add(CompletableFuture.supplyAsync(
                            () -> analysisService.processActivity(client, actId, weightKg, cachedIntervals, cachedStreams), executorService));
                }
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
                log.info("Completed stream analysis for all activities");

                for (CompletableFuture<ActivityProcessingResult> future : futures) {
                    try {
                        ActivityProcessingResult result = future.get();
                        if (result != null && result.best5minAvg > 0) {
                            boolean indoor = indoorByActivityId.getOrDefault(result.activityId, false);
                            performanceService.updateFtpIfBetter(
                                    username, result.activityId, result.activityName,
                                    result.activityType, result.activityDate, result.best5minAvg, indoor);
                            if (weightKg > 0) {
                                performanceService.updateVo2MaxIfBetter(
                                        username, result.activityId, result.activityName,
                                        result.activityType, result.activityDate, weightKg, result.best5minAvg, indoor);
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }
        } catch (Exception e) {
            log.error("Failed to calculate FTP/VO2Max: {}", e.getMessage(), e);
        }

        // Merge locally stored Garmin activities + feed the local fitness model
        try {
            Long uid = ctx.user.getId();
            JsonNode acts = (JsonNode) allData.get("activities");
            fitnessModelService.recordIntervalsLoads(uid, acts);
            fitnessModelService.seedFromIntervalsWellness(uid, (JsonNode) allData.get("wellness"));
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
            String activityJson = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                            .queryParam("intervals", "true").build(activityId))
                    .retrieve().bodyToMono(String.class).block();
            JsonNode activityNode = objectMapper.readTree(activityJson);
            details.put("activity", activityNode);
        } catch (Exception e) {
            log.error("Failed to fetch activity {}: {}", activityId, e.getMessage(), e);
            details.put("activityError", e.getMessage());
        }

        try {
            String streamsJson = client.get()
                    .uri("/api/v1/activity/{id}/streams", activityId)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode[] streamsNodeRef = new JsonNode[1];
            streamsNodeRef[0] = objectMapper.readTree(streamsJson);
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
            enrichIntervalsFromStreams(intervals, (JsonNode) details.get("streams"));
            details.put("intervalSummary", analysisService.extractIntervalSummary(intervals));
            Map<String, Object> intervalsWrapper = new HashMap<>();
            intervalsWrapper.put("icu_intervals", intervals);
            details.put("intervals", intervalsWrapper);
        }

        try {
            String powerCurveJson = client.get()
                    .uri("/api/v1/activity/{id}/power-curve", activityId)
                    .retrieve().bodyToMono(String.class).block();
            details.put("powerCurve", objectMapper.readTree(powerCurveJson));
        } catch (Exception e) {
            log.warn("Failed to fetch power curve for {}: {}", activityId, e.getMessage());
        }

        // Fetch map data (latlngs for the map)
        try {
            String mapJson = client.get()
                    .uri("/api/v1/activity/{id}/map", activityId)
                    .retrieve().bodyToMono(String.class).block();
            if (mapJson != null && !mapJson.isEmpty()) {
                details.put("mapData", objectMapper.readTree(mapJson));
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
            }
            // Missing pieces: fetch once from Intervals and persist into the mirror.
            if (streams == null || intervals == null) {
                try {
                    if (streams == null) {
                        rateLimiter.acquire();
                        streams = objectMapper.readTree(client.get()
                                .uri("/api/v1/activity/{id}/streams", activityId)
                                .retrieve().bodyToMono(String.class).block());
                    }
                    if (intervals == null) {
                        rateLimiter.acquire();
                        JsonNode det = objectMapper.readTree(client.get()
                                .uri(b -> b.path("/api/v1/activity/{id}")
                                        .queryParam("intervals", "true").build(activityId))
                                .retrieve().bodyToMono(String.class).block());
                        if (det.has("icu_intervals")) intervals = det.get("icu_intervals");
                    }
                    intervalsMirrorService.saveStreams(uid, activityId, streams, intervals);
                    log.info("Mirror for {} was missing streams/intervals — fetched and persisted", activityId);
                } catch (Exception e) {
                    log.debug("Mirror streams heal for {} failed: {}", activityId, e.getMessage());
                }
            }
            ObjectNode normalized = normalizeStreams(streams);
            log.info("activity {} mirror normalized streams={}", activityId,
                    normalized == null ? "null" : normalized.fieldNames());
            if (normalized != null) {
                details.put("streams", normalized);
                details.put("powerCurve", com.sgen.service.garmin.CurveCalculator.curve(normalized.get("watts")));
                details.put("hrCurve", com.sgen.service.garmin.CurveCalculator.curve(normalized.get("heartrate")));
                if (normalized.has("latlng")) {
                    details.put("mapData",
                            objectMapper.createObjectNode().set("latlngs", normalized.get("latlng")));
                }
                log.info("activity {} mapData: latlng={} keys={}", activityId,
                        normalized.has("latlng"), normalized.fieldNames());
            }
            // No latlng in stored streams: fetch the /map payload once from Intervals.
            if (!details.containsKey("mapData")) {
                log.info("activity {} has no mapData in mirror — trying /map endpoint", activityId);
                try {
                    String mapJson = client.get()
                            .uri("/api/v1/activity/{id}/map", activityId)
                            .retrieve().bodyToMono(String.class).block();
                    if (mapJson != null && !mapJson.isEmpty()) {
                        details.put("mapData", objectMapper.readTree(mapJson));
                        log.info("activity {} mapData fetched from /map endpoint", activityId);
                    }
                } catch (Exception e) {
                    log.info("Map fetch for {} failed: {}", activityId, e.getMessage());
                }
            }
            if (intervals != null) {
                enrichIntervalsFromStreams(intervals, normalized);
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
        if (streams == null || streams.isNull()) return null;
        if (streams.isObject()) return (ObjectNode) streams;
        if (streams.isArray()) {
            ObjectNode wrapper = objectMapper.createObjectNode();
            for (JsonNode el : streams) {
                String type = el.path("type").asText("");
                if (!type.isEmpty() && el.has("data")) wrapper.set(type, el.get("data"));
            }
            return wrapper;
        }
        return null;
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
    private void enrichIntervalsFromStreams(JsonNode intervals, JsonNode streams) {
        if (intervals == null || !intervals.isArray() || streams == null) return;

        List<Integer> hrData = extractStreamValues(streams, "heartrate");
        List<Double> timeData = extractStreamValuesAsDouble(streams, "time");

        if (hrData == null || hrData.isEmpty() || timeData == null || timeData.isEmpty()
                || hrData.size() != timeData.size()) {
            return;
        }

        ArrayNode intervalArray = (ArrayNode) intervals;

        // Start/end HR for every interval that has valid stream indices
        for (int i = 0; i < intervalArray.size(); i++) {
            JsonNode interval = intervalArray.get(i);
            if (!interval.isObject()) continue;
            int startIndex = interval.path("start_index").asInt(-1);
            if (startIndex >= 0 && startIndex < hrData.size()) {
                int startHr = hrData.get(startIndex);
                if (startHr > 0) {
                    ((ObjectNode) interval).put("start_hr", startHr);
                }
            }
            int endIndex = interval.path("end_index").asInt(-1);
            if (endIndex >= 0 && endIndex < hrData.size()) {
                int endHr = hrData.get(endIndex);
                if (endHr > 0) {
                    ((ObjectNode) interval).put("end_hr", endHr);
                }
            }
        }

        // HRR for REST/RECOVERY intervals that follow a WORK interval
        for (int i = 1; i < intervalArray.size(); i++) {
            JsonNode rest = intervalArray.get(i);
            JsonNode work = intervalArray.get(i - 1);
            if (!rest.isObject() || !work.isObject()) continue;

            String restType = rest.path("type").asText("").toUpperCase();
            String workType = work.path("type").asText("").toUpperCase();
            if (!("RECOVERY".equals(restType) || "REST".equals(restType))) continue;
            if (!"WORK".equals(workType)) continue;

            int workEndIndex = work.path("end_index").asInt(-1);
            int restStartIndex = rest.path("start_index").asInt(-1);
            if (workEndIndex < 0 || workEndIndex >= timeData.size()) continue;
            if (restStartIndex < 0 || restStartIndex >= timeData.size()) continue;

            double restStartTime = timeData.get(restStartIndex);

            // Average HR in the last ~10 seconds before the rest starts
            double endWinStart = Math.max(0, restStartTime - 10);
            double endWinEnd = restStartTime;
            double hrAtEndSum = 0;
            int hrAtEndCount = 0;
            for (int j = 0; j < timeData.size(); j++) {
                double t = timeData.get(j);
                if (t >= endWinStart && t <= endWinEnd && hrData.get(j) > 0) {
                    hrAtEndSum += hrData.get(j);
                    hrAtEndCount++;
                }
            }
            if (hrAtEndCount == 0) continue;
            double hrAtEnd = hrAtEndSum / hrAtEndCount;

            // Average HR around 60 seconds into the rest interval
            double recoveryCenter = restStartTime + 60;
            double window = 5.0;
            double recWinStart = recoveryCenter - window / 2.0;
            double recWinEnd = recoveryCenter + window / 2.0;
            double hrAfterSum = 0;
            int hrAfterCount = 0;
            for (int j = 0; j < timeData.size(); j++) {
                double t = timeData.get(j);
                if (t >= recWinStart && t <= recWinEnd && hrData.get(j) > 0) {
                    hrAfterSum += hrData.get(j);
                    hrAfterCount++;
                }
            }
            if (hrAfterCount == 0) continue;
            double hrAfterRecovery = hrAfterSum / hrAfterCount;

            double hrr = hrAtEnd - hrAfterRecovery;
            ((ObjectNode) rest).put("hrr", Math.round(hrr));
        }
    }

    /**
     * Extract an integer-valued stream from either array or object format.
     */
    private List<Integer> extractStreamValues(JsonNode streams, String key) {
        List<Integer> values = null;
        if (streams.isArray()) {
            for (JsonNode stream : streams) {
                if (key.equals(stream.path("type").asText())) {
                    JsonNode data = stream.path("data");
                    if (data.isArray()) {
                        values = new ArrayList<>(data.size());
                        for (JsonNode d : data) values.add(d.asInt(0));
                    }
                    break;
                }
            }
        } else if (streams.isObject()) {
            JsonNode node = streams.get(key);
            if (node != null && node.isArray()) {
                values = new ArrayList<>(node.size());
                for (JsonNode d : node) values.add(d.asInt(0));
            } else if (node != null && node.has("data")) {
                JsonNode data = node.get("data");
                if (data.isArray()) {
                    values = new ArrayList<>(data.size());
                    for (JsonNode d : data) values.add(d.asInt(0));
                }
            }
        }
        return values;
    }

    /**
     * Extract a double-valued stream from either array or object format.
     */
    private List<Double> extractStreamValuesAsDouble(JsonNode streams, String key) {
        List<Double> values = null;
        if (streams.isArray()) {
            for (JsonNode stream : streams) {
                if (key.equals(stream.path("type").asText())) {
                    JsonNode data = stream.path("data");
                    if (data.isArray()) {
                        values = new ArrayList<>(data.size());
                        for (JsonNode d : data) values.add(d.asDouble(0));
                    }
                    break;
                }
            }
        } else if (streams.isObject()) {
            JsonNode node = streams.get(key);
            if (node != null && node.isArray()) {
                values = new ArrayList<>(node.size());
                for (JsonNode d : node) values.add(d.asDouble(0));
            } else if (node != null && node.has("data")) {
                JsonNode data = node.get("data");
                if (data.isArray()) {
                    values = new ArrayList<>(data.size());
                    for (JsonNode d : data) values.add(d.asDouble(0));
                }
            }
        }
        return values;
    }

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
        ApiContext ctx = getValidatedContext(username);
        Long uid = ctx.user.getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);
        if (garminConnected) {
            byte[] cached = intervalsMirrorService.findImage(uid, activityId, "map");
            if (cached != null && cached.length > 0) {
                log.info("SOURCE=DB user {} map.png served from local mirror: {}", username, activityId);
                return cached;
            }
        }
        try {
            byte[] png = ctx.client.get()
                    .uri("/api/v1/activity/{id}/map.png", activityId)
                    .retrieve().bodyToMono(byte[].class).block();
            if (garminConnected) intervalsMirrorService.saveImage(uid, activityId, "map", png);
            return png;
        } catch (Exception e) {
            return null;
        }
    }

    public byte[] getActivityChartImage(String username, String activityId) {
        ApiContext ctx = getValidatedContext(username);
        Long uid = ctx.user.getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);
        if (garminConnected) {
            byte[] cached = intervalsMirrorService.findImage(uid, activityId, "chart");
            if (cached != null && cached.length > 0) {
                log.info("SOURCE=DB user {} power.png served from local mirror: {}", username, activityId);
                return cached;
            }
        }
        try {
            byte[] png = ctx.client.get()
                    .uri("/api/v1/activity/{id}/power.png", activityId)
                    .retrieve().bodyToMono(byte[].class).block();
            if (garminConnected) intervalsMirrorService.saveImage(uid, activityId, "chart", png);
            return png;
        } catch (Exception e) {
            return null;
        }
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
                    enrichIntervalsFromStreams(resultIntervals, streamsNode);
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
        ApiContext ctx = getValidatedContext(username);
        Long uid = ctx.user.getId();
        if (garminClientFactory.isConnected(uid) && intervalsActivityRepository.countByUserId(uid) > 0) {
            return localCurveHistory(uid, username, oldest, newest, type, "watts");
        }
        String athleteId = ctx.user.getIntervalsAthleteId();
        WebClient client = ctx.client;

        try {
            // If specific type requested, fetch only that
            if (type != null && !type.isBlank() && !"all".equalsIgnoreCase(type)) {
                return fetchPowerCurveForType(client, athleteId, oldest, newest, type);
            }

            // Fetch user's sport settings to find sports with FTP
            List<String> sportsWithFtp = fetchSportsWithFtp(client, athleteId);
            log.debug("User {} has {} sports with FTP configured: {}", username, sportsWithFtp.size(), sportsWithFtp);

            if (sportsWithFtp.isEmpty()) {
                log.warn("No sports with FTP found for user {}", username);
                return objectMapper.createArrayNode();
            }

            // Fetch power curves only for sports with FTP in parallel
            List<CompletableFuture<JsonNode>> futures = new ArrayList<>();
            for (String sportType : sportsWithFtp) {
                futures.add(CompletableFuture.supplyAsync(() -> {
                    try {
                        return fetchPowerCurveForType(client, athleteId, oldest, newest, sportType);
                    } catch (Exception e) {
                        log.warn("Failed to fetch power curve for type {}: {}", sportType, e.getMessage());
                        return null;
                    }
                }, executorService));
            }

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

            // Combine results into a single array with type info
            com.fasterxml.jackson.databind.node.ArrayNode combinedResults = objectMapper.createArrayNode();
            for (int i = 0; i < futures.size(); i++) {
                String sportType = sportsWithFtp.get(i);
                try {
                    JsonNode result = futures.get(i).get();
                    if (result == null) {
                        log.debug("No power curve data for {} (null result)", sportType);
                        continue;
                    }

                    // Intervals.icu returns {"list": [...], "activities": {...}}
                    // Extract the list array from the response
                    JsonNode curveList = result.has("list") ? result.get("list") : null;

                    if (curveList != null && curveList.isArray() && curveList.size() > 0) {
                        log.debug("Fetched power curve for {}: {} curves", sportType, curveList.size());
                        // Add sport type to each curve
                        for (JsonNode curve : curveList) {
                            if (curve.isObject()) {
                                ((com.fasterxml.jackson.databind.node.ObjectNode) curve)
                                        .put("sportType", sportType);
                            }
                        }
                        combinedResults.addAll((com.fasterxml.jackson.databind.node.ArrayNode) curveList);
                    } else {
                        log.debug("No power curve data for {} (empty list)", sportType);
                    }
                } catch (Exception e) {
                    log.warn("Error processing power curve for type {}: {}", sportType, e.getMessage());
                }
            }

            log.debug("Combined power curve results: {} total curves", combinedResults.size());
            return combinedResults;
        } catch (Exception e) {
            log.error("Failed to fetch power curve history for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to fetch power curve history: " + e.getMessage());
        }
    }

    /** Fetch only the fields used by the Fitness & Form training totals panel. */
    public JsonNode getTrainingTotalsActivities(String username, String oldest, String newest) {
        ApiContext ctx = getValidatedContext(username);
        Long uid = ctx.user.getId();
        // Garmin-connected: serve from the local mirror when populated —
        // payloadJson holds the full field set the frontend needs.
        if (garminClientFactory.isConnected(uid) && intervalsActivityRepository.countByUserId(uid) > 0) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            var rows = intervalsActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(uid, from, to);
            var arr = objectMapper.createArrayNode();
            for (var r : rows) {
                try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                catch (Exception e) { log.debug("mirror parse {}", e.getMessage()); }
            }
            log.info("SOURCE=DB user {} training totals served from local mirror: {}", username, arr.size());
            return arr;
        }
        String fields = "id,type,start_date_local,moving_time,distance,icu_distance,coasting_time,total_elevation_gain,icu_training_load,calories,kg_lifted,icu_joules,icu_zone_times,icu_hr_zone_times,pace_zone_times,gap_zone_times,use_gap_zone_times,tiz_order";
        try {
            rateLimiter.acquire();
            String responseJson = ctx.client.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .queryParam("fields", fields)
                            .build(ctx.user.getIntervalsAthleteId()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to fetch training totals for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to fetch training totals: " + e.getMessage(), e);
        }
    }

    private List<String> fetchSportsWithFtp(WebClient client, String athleteId) {
        List<String> sportsWithFtp = new ArrayList<>();
        try {
            String sportSettingsJson = client.get()
                    .uri("/api/v1/athlete/{id}/sport-settings", athleteId)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode sportSettings = objectMapper.readTree(sportSettingsJson);
            for (JsonNode setting : sportSettings) {
                // Check if this sport has FTP configured (> 0), or only indoor FTP
                JsonNode ftpNode = setting.get("ftp");
                int ftp = (ftpNode != null && !ftpNode.isNull()) ? ftpNode.asInt() : 0;
                JsonNode indoorFtpNode = setting.get("indoor_ftp");
                int indoorFtp = (indoorFtpNode != null && !indoorFtpNode.isNull()) ? indoorFtpNode.asInt() : 0;

                if (ftp > 0 || indoorFtp > 0) {
                    // Get the first sport type from the types array as the main type
                    JsonNode types = setting.get("types");
                    if (types != null && types.isArray() && types.size() > 0) {
                        String mainType = types.get(0).asText();
                        sportsWithFtp.add(mainType);
                        log.debug("Found sport with FTP: {} (FTP: {})", mainType, ftp);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch sport settings for athlete {}: {}", athleteId, e.getMessage());
        }
        return sportsWithFtp;
    }

    /**
     * Local curve history for Garmin users: best-average-per-duration computed
     * from mirrored streams (watts or heartrate), max-merged per activity type.
     * Returns the same array-of-curves shape the combined API path produces.
     */
    JsonNode localCurveHistory(Long uid, String username, String oldest, String newest,
                                       String type, String streamKey) {
        var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
        var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
        var rows = intervalsActivityRepository
                .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(uid, from, to);
        var byType = new LinkedHashMap<String, java.util.List<String>>();
        for (var r : rows) {
            String t;
            try {
                t = objectMapper.readTree(r.getPayloadJson()).path("type").asText("");
            } catch (Exception e) { continue; }
            if (t.isEmpty()) continue;
            if (type != null && !type.isBlank() && !"all".equalsIgnoreCase(type) && !type.equalsIgnoreCase(t)) continue;
            byType.computeIfAbsent(t, k -> new ArrayList<>()).add(r.getActivityId());
        }
        var out = objectMapper.createArrayNode();
        for (var e : byType.entrySet()) {
            Map<Integer, Double> best = new java.util.TreeMap<>();
            for (String id : e.getValue()) {
                var srow = intervalsStreamsRepository.findByUserIdAndActivityId(uid, id).orElse(null);
                if (srow == null || srow.getStreamsJson() == null) continue;
                try {
                    ObjectNode normalized = normalizeStreams(objectMapper.readTree(srow.getStreamsJson()));
                    if (normalized == null || !normalized.has(streamKey)) continue;
                    ObjectNode c = com.sgen.service.garmin.CurveCalculator.curve(normalized.get(streamKey));
                    var secs = c.path("secs"); var vals = c.path("values");
                    for (int i = 0; i < secs.size(); i++) {
                        int s = secs.get(i).asInt();
                        double v = vals.get(i).asDouble();
                        if (v > best.getOrDefault(s, 0.0)) best.put(s, v);
                    }
                } catch (Exception ex) { log.debug("local curve {} failed: {}", id, ex.getMessage()); }
            }
            if (best.isEmpty()) continue;
            ObjectNode curve = objectMapper.createObjectNode();
            var secs = curve.putArray("secs");
            var vals = curve.putArray("values");
            best.forEach((s, v) -> { secs.add(s); vals.add(v); });
            curve.put("type", e.getKey());
            curve.put("sportType", e.getKey());
            out.add(curve);
        }
        log.info("SOURCE=DB user {} {} curve history computed from local mirror: {} types",
                username, streamKey, out.size());
        return out;
    }

    private JsonNode fetchPowerCurveForType(WebClient client, String athleteId, String oldest, String newest, String type) {
        try {
            // Format: r.YYYY-MM-DD.YYYY-MM-DD for date range
            String dateRangeCurve = "r." + oldest + "." + newest;

            String responseJson = client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/power-curves.json")
                            .queryParam("curves", dateRangeCurve)
                            .queryParam("type", type)
                            .build(athleteId))
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            throw new RuntimeException("Failed to fetch power curve for type " + type + ": " + e.getMessage(), e);
        }
    }

    // -------------------------------------------------------------------------
    // Connection test
    // -------------------------------------------------------------------------

    public boolean testConnection(String username) {
        try {
            ApiContext ctx = clientFactory.buildContext(userService, username);
            String response = ctx.client.get()
                    .uri("/api/v1/athlete/{id}", ctx.user.getIntervalsAthleteId())
                    .retrieve().bodyToMono(String.class).block();
            return response != null;
        } catch (Exception e) {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Training preferences (stored locally in User entity)
    // -------------------------------------------------------------------------

    public Map<String, Object> getTrainingPreferences(String username) {
        User user = userService.getUserEntityByUsername(username);
        if (user.getTrainingPreferences() == null || user.getTrainingPreferences().isEmpty()) {
            return new HashMap<>();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> prefs = objectMapper.readValue(user.getTrainingPreferences(), Map.class);
            return prefs;
        } catch (Exception e) {
            log.error("Failed to parse training preferences for user {}: {}", username, e.getMessage());
            return new HashMap<>();
        }
    }

    public void saveTrainingPreferences(String username, Map<String, Object> preferences) {
        User user = userService.getUserEntityByUsername(username);
        try {
            user.setTrainingPreferences(objectMapper.writeValueAsString(preferences));
            userService.saveUser(user);
        } catch (Exception e) {
            log.error("Failed to save training preferences for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to save training preferences", e);
        }
    }
}
