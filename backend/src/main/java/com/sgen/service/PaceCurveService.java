package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.util.IntervalsApiRateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service for calculating pace curves (speed over time) for running activities.
 * Similar to power curves but for pace/speed instead of watts.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PaceCurveService {

    private final ObjectMapper objectMapper;
    private final IntervalsClientFactory clientFactory;
    private final UserService userService;
    private final IntervalsApiRateLimiter rateLimiter;

    /**
     * Standard duration checkpoints for pace curves (in seconds)
     */
    private static final int[] PACE_CURVE_DURATIONS = {
        30,      // 30 seconds - sprint
        60,      // 1 minute
        120,     // 2 minutes
        300,     // 5 minutes
        600,     // 10 minutes
        1200,    // 20 minutes
        1800,    // 30 minutes
        3600,    // 1 hour
        7200,    // 2 hours
        10800,   // 3 hours
        14400,   // 4 hours
        18000    // 5 hours
    };

    /**
     * Calculate pace curve for a specific activity
     */
    public PaceCurveResult calculateActivityPaceCurve(String username, String activityId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        
        try {
            rateLimiter.acquire();
            
            // Get activity details
            String activityJson = ctx.client.get()
                    .uri("/api/v1/activity/{id}", activityId)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode activityNode = objectMapper.readTree(activityJson);
            
            // Check if it's a running activity
            String type = activityNode.path("type").asText("");
            if (!isRunningActivity(type)) {
                return null;
            }
            
            // Get streams
            rateLimiter.acquire();
            String streamsJson = ctx.client.get()
                    .uri("/api/v1/activity/{id}/streams", activityId)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode streamsNode = objectMapper.readTree(streamsJson);
            
            // Calculate pace curve
            Map<Integer, Double> paceCurve = calculatePaceFromStreams(streamsNode);
            
            if (paceCurve.isEmpty()) {
                return null;
            }
            
            PaceCurveResult result = new PaceCurveResult();
            result.setActivityId(activityId);
            result.setActivityName(activityNode.path("name").asText(""));
            result.setActivityDate(activityNode.path("start_date_local").asText("").substring(0, 10));
            result.setSportType(type);
            result.setPaceData(paceCurve);
            result.setTotalDistance(activityNode.path("distance").asDouble(0));
            result.setTotalTime(activityNode.path("moving_time").asInt(0));
            
            // Calculate average pace
            if (result.getTotalDistance() > 0 && result.getTotalTime() > 0) {
                double avgPaceMs = result.getTotalDistance() / result.getTotalTime(); // m/s
                result.setAveragePace(avgPaceMs);
            }
            
            return result;
            
        } catch (Exception e) {
            log.error("Failed to calculate pace curve for activity {}: {}", activityId, e.getMessage());
            return null;
        }
    }

    /**
     * Get pace curve history across multiple activities (like power curve history)
     */
    public List<PaceCurveResult> getPaceCurveHistory(String username, String oldest, String newest) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        List<PaceCurveResult> results = new ArrayList<>();
        
        try {
            rateLimiter.acquire();
            
            // Get running activities in date range
            String activitiesJson = ctx.client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()))
                    .retrieve().bodyToMono(String.class).block();
            
            JsonNode activitiesNode = objectMapper.readTree(activitiesJson);
            
            if (!activitiesNode.isArray()) {
                return results;
            }
            
            // Process each running activity
            for (JsonNode activity : activitiesNode) {
                String activityId = activity.path("id").asText();
                String type = activity.path("type").asText("");
                
                if (isRunningActivity(type)) {
                    PaceCurveResult curve = calculateActivityPaceCurve(username, activityId);
                    if (curve != null && !curve.getPaceData().isEmpty()) {
                        results.add(curve);
                    }
                }
            }
            
            // Sort by date
            results.sort(Comparator.comparing(PaceCurveResult::getActivityDate).reversed());
            
            return results;
            
        } catch (Exception e) {
            log.error("Failed to get pace curve history: {}", e.getMessage());
            return results;
        }
    }

    /**
     * Calculate pace (m/s) for each duration checkpoint using velocity data
     */
    private Map<Integer, Double> calculatePaceFromStreams(JsonNode streamsNode) {
        Map<Integer, Double> paceData = new LinkedHashMap<>();
        
        if (streamsNode == null || !streamsNode.has("velocity_smooth")) {
            return paceData;
        }
        
        JsonNode velocityNode = streamsNode.get("velocity_smooth");
        if (velocityNode == null || !velocityNode.isArray() || velocityNode.size() == 0) {
            return paceData;
        }
        
        // Convert velocity data to array
        int dataPoints = velocityNode.size();
        double[] velocities = new double[dataPoints];
        for (int i = 0; i < dataPoints; i++) {
            velocities[i] = velocityNode.get(i).asDouble(0);
        }
        
        // Calculate best pace for each duration
        for (int duration : PACE_CURVE_DURATIONS) {
            if (duration > dataPoints) {
                continue; // Not enough data for this duration
            }
            
            double bestAvgVelocity = 0;
            
            // Sliding window to find best average velocity for this duration
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
     * Check if activity type is a running activity
     */
    private boolean isRunningActivity(String type) {
        if (type == null) return false;
        String lower = type.toLowerCase();
        return lower.contains("run") || lower.contains("trail") || lower.contains("hike") || 
               lower.equals("virtualrun");
    }

    /**
     * Convert velocity (m/s) to pace string (min:sec/km or min:sec/mile)
     */
    public static String velocityToPace(double velocityMs, boolean metric) {
        if (velocityMs <= 0) return "--:--";
        
        double distanceUnit = metric ? 1000 : 1609.34; // km or mile
        double secondsPerUnit = distanceUnit / velocityMs;
        
        int minutes = (int) (secondsPerUnit / 60);
        int seconds = (int) (secondsPerUnit % 60);
        
        return String.format("%d:%02d", minutes, seconds);
    }

    /**
     * Result class for pace curve data
     */
    public static class PaceCurveResult {
        private String activityId;
        private String activityName;
        private String activityDate;
        private String sportType;
        private Map<Integer, Double> paceData; // duration (sec) -> velocity (m/s)
        private double averagePace; // m/s
        private double totalDistance; // meters
        private int totalTime; // seconds

        // Getters and setters
        public String getActivityId() { return activityId; }
        public void setActivityId(String activityId) { this.activityId = activityId; }
        
        public String getActivityName() { return activityName; }
        public void setActivityName(String activityName) { this.activityName = activityName; }
        
        public String getActivityDate() { return activityDate; }
        public void setActivityDate(String activityDate) { this.activityDate = activityDate; }
        
        public String getSportType() { return sportType; }
        public void setSportType(String sportType) { this.sportType = sportType; }
        
        public Map<Integer, Double> getPaceData() { return paceData; }
        public void setPaceData(Map<Integer, Double> paceData) { this.paceData = paceData; }
        
        public double getAveragePace() { return averagePace; }
        public void setAveragePace(double averagePace) { this.averagePace = averagePace; }
        
        public double getTotalDistance() { return totalDistance; }
        public void setTotalDistance(double totalDistance) { this.totalDistance = totalDistance; }
        
        public int getTotalTime() { return totalTime; }
        public void setTotalTime(int totalTime) { this.totalTime = totalTime; }
    }
}
