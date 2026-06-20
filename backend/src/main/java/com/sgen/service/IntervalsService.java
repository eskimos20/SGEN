package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.service.IntervalsActivityAnalysisService.ActivityProcessingResult;
import com.sgen.service.IntervalsClientFactory.ApiContext;
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

    private static final int PARALLEL_REQUESTS = 5;
    private final ExecutorService executorService = Executors.newFixedThreadPool(PARALLEL_REQUESTS);

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
        ApiContext ctx = getValidatedContext(username);
        String athleteId = ctx.user.getIntervalsAthleteId();
        WebClient client = ctx.client;
        Map<String, Object> allData = new HashMap<>();

        // Activities
        try {
            String activitiesJson = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest).queryParam("newest", newest)
                            .build(athleteId))
                    .retrieve().bodyToMono(String.class).block();
            JsonNode activitiesNode = objectMapper.readTree(activitiesJson);

            if (activitiesNode.isArray()) {
                log.info("Fetching interval data for {} activities", activitiesNode.size());
                for (JsonNode activity : activitiesNode) {
                    String activityId = activity.path("id").asText();
                    String name = activity.path("name").asText("");
                    String type = activity.path("type").asText("");
                    String source = activity.path("source").asText("");
                    if (name.isEmpty() && type.isEmpty() && "STRAVA".equals(source)) {
                        ((com.fasterxml.jackson.databind.node.ObjectNode) activity).put("_strava_restricted", true);
                        continue;
                    }
                    if (activityId != null && !activityId.isEmpty()) {
                        try {
                            rateLimiter.acquire();
                            String detailJson = client.get()
                                    .uri(uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                                            .queryParam("intervals", "true").build(activityId))
                                    .retrieve().bodyToMono(String.class).block();
                            JsonNode details = objectMapper.readTree(detailJson);
                            if (details.has("icu_intervals")) {
                                ((com.fasterxml.jackson.databind.node.ObjectNode) activity)
                                        .set("icu_intervals", details.get("icu_intervals"));
                            }
                            if (details.has("icu_max_watts") && !activity.has("icu_max_watts")) {
                                ((com.fasterxml.jackson.databind.node.ObjectNode) activity)
                                        .set("icu_max_watts", details.get("icu_max_watts"));
                            }
                        } catch (Exception e) {
                            log.warn("Failed to fetch intervals for activity {}: {}", activityId, e.getMessage());
                        }
                    }
                }
                log.info("Completed fetching interval data for all activities");
            }
            allData.put("activities", activitiesNode);
        } catch (Exception e) {
            log.error("Failed to fetch activities: {}", e.getMessage(), e);
            allData.put("activities", null);
            allData.put("activitiesError", e.getMessage());
        }

        // Athlete profile
        try {
            rateLimiter.acquire();
            String athleteJson = client.get().uri("/api/v1/athlete/{id}", athleteId)
                    .retrieve().bodyToMono(String.class).block();
            allData.put("athlete", objectMapper.readTree(athleteJson));
        } catch (Exception e) {
            log.error("Failed to fetch athlete profile: {}", e.getMessage(), e);
            allData.put("athlete", null);
            allData.put("athleteError", e.getMessage());
        }

        // Sport settings
        try {
            rateLimiter.acquire();
            String sportSettingsJson = client.get().uri("/api/v1/athlete/{id}/sport-settings", athleteId)
                    .retrieve().bodyToMono(String.class).block();
            allData.put("sportSettings", objectMapper.readTree(sportSettingsJson));
        } catch (Exception e) {
            log.error("Failed to fetch sport settings: {}", e.getMessage(), e);
            allData.put("sportSettings", null);
        }

        // Events
        try {
            rateLimiter.acquire();
            String eventsJson = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/events")
                            .queryParam("oldest", oldest).queryParam("newest", newest)
                            .build(athleteId))
                    .retrieve().bodyToMono(String.class).block();
            allData.put("events", objectMapper.readTree(eventsJson));
        } catch (Exception e) {
            log.error("Failed to fetch events: {}", e.getMessage(), e);
            allData.put("events", null);
        }

        // FTP / VO2Max calculation via parallel activity processing
        try {
            JsonNode activitiesNode = (JsonNode) allData.get("activities");
            JsonNode athleteNode = (JsonNode) allData.get("athlete");
            if (activitiesNode != null && activitiesNode.isArray() && athleteNode != null) {
                double tempWeight = athleteNode.path("icu_weight").asDouble(0);
                if (tempWeight <= 0) tempWeight = athleteNode.path("weight").asDouble(0);
                final double weightKg = tempWeight;

                log.info("Fetching streams data for {} activities", activitiesNode.size());
                List<CompletableFuture<ActivityProcessingResult>> futures = new ArrayList<>();
                for (JsonNode activity : activitiesNode) {
                    final String actId = activity.path("id").asText();
                    final JsonNode cachedIntervals = activity.path("icu_intervals").isArray()
                            ? activity.path("icu_intervals") : null;
                    futures.add(CompletableFuture.supplyAsync(
                            () -> analysisService.processActivity(client, actId, weightKg, cachedIntervals), executorService));
                }
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
                log.info("Completed fetching streams data for all activities");

                for (CompletableFuture<ActivityProcessingResult> future : futures) {
                    try {
                        ActivityProcessingResult result = future.get();
                        if (result != null && result.best5minAvg > 0) {
                            performanceService.updateFtpIfBetter(
                                    username, result.activityId, result.activityName,
                                    result.activityType, result.activityDate, result.best5minAvg);
                            if (weightKg > 0) {
                                performanceService.updateVo2MaxIfBetter(
                                        username, result.activityId, result.activityName,
                                        result.activityType, result.activityDate, weightKg, result.best5minAvg);
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }
        } catch (Exception e) {
            log.error("Failed to calculate FTP/VO2Max: {}", e.getMessage(), e);
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

        try {
            String activityJson = client.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                            .queryParam("intervals", "true").build(activityId))
                    .retrieve().bodyToMono(String.class).block();
            JsonNode activityNode = objectMapper.readTree(activityJson);
            details.put("activity", activityNode);

            if (activityNode.has("icu_intervals")) {
                details.put("intervalSummary",
                        analysisService.extractIntervalSummary(activityNode.get("icu_intervals")));
                Map<String, Object> intervalsWrapper = new HashMap<>();
                intervalsWrapper.put("icu_intervals", activityNode.get("icu_intervals"));
                details.put("intervals", intervalsWrapper);
            }
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

        // Calculate pace curve for running activities
        try {
            JsonNode activityNode = (JsonNode) details.get("activity");
            if (activityNode != null) {
                String type = activityNode.path("type").asText("");
                log.debug("Checking activity {} for pace curve, type: {}", activityId, type);
                
                if (isRunningActivity(type)) {
                    log.debug("Activity {} is running activity, checking streams", activityId);
                    // Get the processed streams (could be original or wrapper from array processing)
                    JsonNode streamsNodeForPace = (JsonNode) details.get("streams");
                    
                    if (streamsNodeForPace != null) {
                        if (streamsNodeForPace.has("velocity_smooth") || streamsNodeForPace.has("distance") || streamsNodeForPace.has("watts") || streamsNodeForPace.has("pace")) {
                            log.debug("Streams available for {}, calculating pace curve", activityId);
                            Map<Integer, Double> paceCurve = calculatePaceFromStreams(streamsNodeForPace);
                        
                            if (!paceCurve.isEmpty()) {
                                Map<String, Object> paceResult = new HashMap<>();
                                paceResult.put("activityId", activityId);
                                paceResult.put("activityName", activityNode.path("name").asText(""));
                                
                                // Safe date parsing
                                String dateStr = activityNode.path("start_date_local").asText("");
                                if (dateStr.length() >= 10) {
                                    paceResult.put("activityDate", dateStr.substring(0, 10));
                                } else {
                                    paceResult.put("activityDate", dateStr);
                                }
                                
                                paceResult.put("sportType", type);
                                paceResult.put("paceData", paceCurve);
                                paceResult.put("totalDistance", activityNode.path("distance").asDouble(0));
                                paceResult.put("totalTime", activityNode.path("moving_time").asInt(0));
                                details.put("paceCurve", paceResult);
                                log.debug("Pace curve calculated successfully for activity {}", activityId);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to calculate pace curve for {}: {}", activityId, e.getMessage(), e);
        }

        return details;
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
        try {
            return ctx.client.get()
                    .uri("/api/v1/activity/{id}/map.png", activityId)
                    .retrieve().bodyToMono(byte[].class).block();
        } catch (Exception e) {
            return null;
        }
    }

    public byte[] getActivityChartImage(String username, String activityId) {
        ApiContext ctx = getValidatedContext(username);
        try {
            return ctx.client.get()
                    .uri("/api/v1/activity/{id}/power.png", activityId)
                    .retrieve().bodyToMono(byte[].class).block();
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
            return analysisService.updateActivityIntervals(username, activityId, intervals, searchDuration, activityNode, streamsNode);
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
                // Check if this sport has FTP configured (> 0)
                JsonNode ftpNode = setting.get("ftp");
                int ftp = (ftpNode != null && !ftpNode.isNull()) ? ftpNode.asInt() : 0;

                if (ftp > 0) {
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
