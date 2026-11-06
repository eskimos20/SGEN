package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.garmin.IntervalsMirrorService;
import com.sgen.util.IntervalsApiRateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Statistics-oriented Intervals endpoints extracted from IntervalsService:
 * power curve history, training totals, sport settings with FTP,
 * connection test and training preferences.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsStatsService {

    private final UserService userService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final IntervalsClientFactory clientFactory;
    private final IntervalsApiClient intervalsApi;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final IntervalsMirrorService intervalsMirrorService;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;

    private static final int PARALLEL_REQUESTS = 4;
    private final ExecutorService executorService = Executors.newFixedThreadPool(PARALLEL_REQUESTS);

    @jakarta.annotation.PreDestroy
    public void shutdown() {
        executorService.shutdown();
    }

    public JsonNode getPowerCurveHistory(String username, String oldest, String newest, String type) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        Long uid = ctx.user.getId();
        String fields = "id,type,start_date_local,moving_time,distance,icu_distance,coasting_time,total_elevation_gain,icu_training_load,calories,kg_lifted,icu_joules,icu_zone_times,icu_hr_zone_times,pace_zone_times,gap_zone_times,use_gap_zone_times,tiz_order";
        // Garmin-connected: refresh the range from Intervals into the mirror,
        // then serve it — payloadJson holds the full field set the frontend needs.
        if (garminClientFactory.isConnected(uid) && intervalsActivityRepository.countByUserId(uid) > 0) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            try {
                JsonNode fetched = intervalsApi.getJson(ctx.client,
                        uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                                .queryParam("oldest", oldest)
                                .queryParam("newest", newest)
                                .queryParam("fields", fields)
                                .build(ctx.user.getIntervalsAthleteId()));
                if (fetched != null && fetched.isArray()) {
                    var keepIds = new java.util.HashSet<String>();
                    for (JsonNode a : fetched) {
                        intervalsMirrorService.mergeActivityPayload(uid, a);
                        keepIds.add(a.path("id").asText());
                    }
                    intervalsMirrorService.pruneActivities(uid, from, to, keepIds);
                }
            } catch (Exception e) {
                log.debug("Training totals mirror refresh failed: {}", e.getMessage());
            }
            var rows = intervalsActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(uid, from, to);
            var arr = com.sgen.util.JsonPayloads.toPayloadArray(
                    rows, r -> r.getPayloadJson(), objectMapper);
            log.info("SOURCE=DB user {} training totals served from local mirror: {}", username, arr.size());
            return arr;
        }
        try {
            return intervalsApi.getJson(ctx.client,
                    uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .queryParam("fields", fields)
                            .build(ctx.user.getIntervalsAthleteId()));
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
            String t = r.getActivityType();
            if (t == null || t.isEmpty()) continue;
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
                    JsonNode c = null;
                    // Stored per-activity curve — computed once, merged forever.
                    if (srow.getCurvesJson() != null) {
                        JsonNode stored = objectMapper.readTree(srow.getCurvesJson());
                        if (stored.has(streamKey)) c = stored.get(streamKey);
                    }
                    if (c == null) {
                        ObjectNode normalized = com.sgen.service.garmin.CurveCalculator.normalizeStreams(objectMapper.readTree(srow.getStreamsJson()));
                        if (normalized == null || !normalized.has(streamKey)) continue;
                        c = com.sgen.service.garmin.CurveCalculator.curve(normalized.get(streamKey));
                        ObjectNode curves = srow.getCurvesJson() != null
                                ? (ObjectNode) objectMapper.readTree(srow.getCurvesJson())
                                : objectMapper.createObjectNode();
                        curves.set(streamKey, c);
                        srow.setCurvesJson(objectMapper.writeValueAsString(curves));
                        intervalsStreamsRepository.save(srow);
                    }
                    var secs = c.path("secs"); var vals = c.path("values");
                    for (int i = 0; i < secs.size(); i++) {
                        int sec = secs.get(i).asInt();
                        double v = vals.get(i).asDouble();
                        if (v > best.getOrDefault(sec, 0.0)) best.put(sec, v);
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
