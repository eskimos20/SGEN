package com.sgen.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.exception.StravaNotConnectedException;
import com.sgen.exception.StravaRateLimitException;
import com.sgen.service.StravaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/strava")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class StravaStatisticsController {

    private final StravaService stravaService;
    private final ObjectMapper objectMapper;

    @PostMapping("/exchange-code")
    public ResponseEntity<Map<String, Object>> exchangeCode(
            Authentication authentication,
            @RequestBody Map<String, String> request) {
        
        String code = request.get("code");
        boolean success = stravaService.exchangeAuthorizationCode(authentication.getName(), code);
        
        return ResponseEntity.ok(Map.of(
                "success", success,
                "message", success ? "Authorization successful" : "Authorization failed"
        ));
    }

    @GetMapping("/test")
    public ResponseEntity<Map<String, Object>> testConnection(Authentication authentication) {
        Map<String, Object> result = stravaService.testConnection(authentication.getName());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/activities")
    public ResponseEntity<String> getActivities(
            Authentication authentication,
            @RequestParam(required = false) Long after,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false, defaultValue = "1") Integer page,
            @RequestParam(required = false, defaultValue = "30") Integer perPage) {
        
        String activitiesJson = stravaService.getAthleteActivities(
                authentication.getName(), 
                after, 
                before, 
                page, 
                perPage
        );
        return ResponseEntity.ok(activitiesJson);
    }

    @GetMapping("/activities/{activityId}")
    public ResponseEntity<String> getActivityById(
            Authentication authentication,
            @PathVariable Long activityId,
            @RequestParam(required = false, defaultValue = "true") Boolean includeAllEfforts) {
        
        String activityJson = stravaService.getActivityById(
                authentication.getName(), 
                activityId, 
                includeAllEfforts
        );
        return ResponseEntity.ok(activityJson);
    }

    @GetMapping("/activities/{activityId}/zones")
    public ResponseEntity<String> getActivityZones(
            Authentication authentication,
            @PathVariable Long activityId) {
        
        String zonesJson = stravaService.getActivityZones(
                authentication.getName(), 
                activityId
        );
        return ResponseEntity.ok(zonesJson);
    }

    @GetMapping("/activities/{activityId}/streams")
    public ResponseEntity<String> getActivityStreams(
            Authentication authentication,
            @PathVariable Long activityId,
            @RequestParam(required = false, defaultValue = "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth") String keys) {
        
        String streamsJson = stravaService.getActivityStreams(
                authentication.getName(), 
                activityId, 
                keys
        );
        return ResponseEntity.ok(streamsJson);
    }

    @GetMapping("/activities/{activityId}/laps")
    public ResponseEntity<String> getActivityLaps(
            Authentication authentication,
            @PathVariable Long activityId) {
        
        String lapsJson = stravaService.getActivityLaps(
                authentication.getName(), 
                activityId
        );
        return ResponseEntity.ok(lapsJson);
    }

    @GetMapping("/segments/{segmentId}/leaderboard")
    public ResponseEntity<String> getSegmentLeaderboard(
            Authentication authentication,
            @PathVariable Long segmentId,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) String ageGroup,
            @RequestParam(required = false) String weightClass,
            @RequestParam(required = false) Boolean following,
            @RequestParam(required = false) Integer clubId,
            @RequestParam(required = false) String dateRange,
            @RequestParam(required = false) Integer contextEntries,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false, defaultValue = "10") Integer perPage) {
        
        String leaderboardJson = stravaService.getSegmentLeaderboard(
                authentication.getName(), 
                segmentId,
                gender,
                ageGroup,
                weightClass,
                following,
                clubId,
                dateRange,
                contextEntries,
                page,
                perPage
        );
        return ResponseEntity.ok(leaderboardJson);
    }

    @GetMapping("/segment-efforts/{segmentEffortId}")
    public ResponseEntity<String> getSegmentEffort(
            Authentication authentication,
            @PathVariable Long segmentEffortId) {
        
        String effortJson = stravaService.getSegmentEffortById(
                authentication.getName(), 
                segmentEffortId
        );
        return ResponseEntity.ok(effortJson);
    }

    @GetMapping("/segments/{segmentId}")
    public ResponseEntity<String> getSegment(
            Authentication authentication,
            @PathVariable Long segmentId) {
        
        String segmentJson = stravaService.getSegmentById(
                authentication.getName(), 
                segmentId
        );
        return ResponseEntity.ok(segmentJson);
    }

    @GetMapping("/activities/{activityId}/photos")
    public ResponseEntity<String> getActivityPhotos(
            Authentication authentication,
            @PathVariable Long activityId) {
        
        String photosJson = stravaService.getActivityPhotos(
                authentication.getName(), 
                activityId
        );
        return ResponseEntity.ok(photosJson);
    }

    /**
     * Find Strava activity by date and return photos
     * Used to match Intervals.icu activities with Strava activities
     */
    @GetMapping("/photos/by-date")
    public ResponseEntity<Map<String, Object>> getPhotosByDate(
            Authentication authentication,
            @RequestParam Long startDate,  // Unix timestamp in seconds
            @RequestParam(required = false, defaultValue = "300") Integer toleranceSeconds) {
        
        try {
            // Search for activities around the given date (± tolerance)
            long after = startDate - toleranceSeconds;
            long before = startDate + toleranceSeconds + 3600; // +1 hour to account for activity duration
            
            String activitiesJson = stravaService.getAthleteActivities(
                    authentication.getName(), 
                    after, 
                    before, 
                    1, 
                    10
            );
            
            // Parse activities to find matching one
            JsonNode activities = objectMapper.readTree(activitiesJson);
            if (activities.isArray() && activities.size() > 0) {
                // Find the activity with closest start time
                JsonNode closestActivity = null;
                long minDiff = Long.MAX_VALUE;
                
                for (JsonNode activity : activities) {
                    // Strava returns start_date as ISO string, e.g., "2024-01-15T08:30:00Z"
                    String startDateStr = activity.path("start_date").asText("");
                    long activityStart = 0;
                    
                    if (!startDateStr.isEmpty()) {
                        try {
                            // Parse ISO date to Unix timestamp
                            java.time.Instant instant = java.time.Instant.parse(startDateStr);
                            activityStart = instant.getEpochSecond();
                        } catch (Exception e) {
                            log.warn("Could not parse start_date: {}", startDateStr);
                        }
                    }
                    
                    if (activityStart > 0) {
                        long diff = Math.abs(activityStart - startDate);
                        if (diff < minDiff && diff <= toleranceSeconds) {
                            minDiff = diff;
                            closestActivity = activity;
                        }
                    }
                }
                
                if (closestActivity != null) {
                    Long activityId = closestActivity.path("id").asLong();
                    String photosJson = stravaService.getActivityPhotos(
                            authentication.getName(), 
                            activityId
                    );
                    
                    JsonNode photos = objectMapper.readTree(photosJson);
                    Map<String, Object> result = new HashMap<>();
                    result.put("found", true);
                    result.put("activityId", activityId);
                    result.put("activityName", closestActivity.path("name").asText(""));
                    result.put("photos", photos);
                    
                    return ResponseEntity.ok(result);
                }
            }
            
            // No matching activity found
            Map<String, Object> result = new HashMap<>();
            result.put("found", false);
            result.put("photos", objectMapper.readTree("[]"));
            return ResponseEntity.ok(result);
            
        } catch (StravaRateLimitException e) {
            throw e;
        } catch (StravaNotConnectedException e) {
            // Strava not connected - return empty result without warning
            Map<String, Object> result = new HashMap<>();
            result.put("found", false);
            result.put("photos", "[]");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to get photos by date for user: {} - {}", authentication.getName(), e.getMessage());
            Map<String, Object> result = new HashMap<>();
            result.put("found", false);
            result.put("error", e.getMessage());
            result.put("photos", "[]");
            return ResponseEntity.ok(result);
        }
    }

    /**
     * Find Strava activity by date and return segment efforts
     * Returns all segments ridden during that activity with performance data
     */
    @GetMapping("/segments/by-date")
    public ResponseEntity<Map<String, Object>> getSegmentsByDate(
            Authentication authentication,
            @RequestParam Long startDate,  // Unix timestamp in seconds
            @RequestParam(required = false, defaultValue = "300") Integer toleranceSeconds) {
        
        try {
            log.debug("🔍 Searching Strava segments for user {} around timestamp {} (tolerance: {}s)", 
                    authentication.getName(), startDate, toleranceSeconds);
            
            // Search for activities around the given date (± tolerance)
            long after = startDate - toleranceSeconds;
            long before = startDate + toleranceSeconds + 3600; // +1 hour to account for activity duration
            
            String activitiesJson = stravaService.getAthleteActivities(
                    authentication.getName(), 
                    after, 
                    before, 
                    1, 
                    10
            );
            
            // Parse activities to find matching one
            JsonNode activities = objectMapper.readTree(activitiesJson);
            log.debug("Found {} Strava activities in date range", activities.size());
            
            if (activities.isArray() && activities.size() > 0) {
                // Find the activity with closest start time
                JsonNode closestActivity = null;
                long minDiff = Long.MAX_VALUE;
                
                for (JsonNode activity : activities) {
                    // Strava returns start_date as ISO string, e.g., "2024-01-15T08:30:00Z"
                    String startDateStr = activity.path("start_date").asText("");
                    long activityStart = 0;
                    
                    if (!startDateStr.isEmpty()) {
                        try {
                            // Parse ISO date to Unix timestamp
                            java.time.Instant instant = java.time.Instant.parse(startDateStr);
                            activityStart = instant.getEpochSecond();
                        } catch (Exception e) {
                            log.warn("Could not parse start_date: {}", startDateStr);
                        }
                    }
                    
                    if (activityStart > 0) {
                        long diff = Math.abs(activityStart - startDate);
                        if (diff < minDiff && diff <= toleranceSeconds) {
                            minDiff = diff;
                            closestActivity = activity;
                        }
                    }
                }
                
                if (closestActivity != null) {
                    Long activityId = closestActivity.path("id").asLong();
                    String activityName = closestActivity.path("name").asText("");
                    
                    // Get segment efforts for this activity
                    String segmentsJson = stravaService.getActivitySegmentEfforts(
                            authentication.getName(), 
                            activityId
                    );
                    
                    JsonNode segments = objectMapper.readTree(segmentsJson);
                    log.debug("Found {} segments for activity {}", segments.size(), activityId);
                    
                    Map<String, Object> result = new HashMap<>();
                    result.put("found", true);
                    result.put("activityId", activityId);
                    result.put("activityName", activityName);
                    result.put("segments", segments);
                    
                    return ResponseEntity.ok(result);
                }
            }
            
            // No matching activity found
            log.debug("No matching Strava activity found for timestamp {}", startDate);
            Map<String, Object> result = new HashMap<>();
            result.put("found", false);
            result.put("segments", objectMapper.readTree("[]"));
            return ResponseEntity.ok(result);
            
        } catch (StravaRateLimitException e) {
            throw e;
        } catch (StravaNotConnectedException e) {
            // Strava not connected - return empty result without warning
            Map<String, Object> result = new HashMap<>();
            result.put("found", false);
            result.put("segments", "[]");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to get segments by date for user: {} - {}", authentication.getName(), e.getMessage());
            Map<String, Object> result = new HashMap<>();
            result.put("found", false);
            result.put("error", e.getMessage());
            result.put("segments", "[]");
            return ResponseEntity.ok(result);
        }
    }

    /**
     * Get all efforts for a segment (to find PR)
     * Returns array of efforts for current athlete on this segment
     */
    @GetMapping("/segments/{segmentId}/efforts")
    public ResponseEntity<String> getSegmentEfforts(
            Authentication authentication,
            @PathVariable Long segmentId) {
        
        try {
            String effortsJson = stravaService.getSegmentAllEfforts(
                    authentication.getName(), 
                    segmentId
            );
            
            return ResponseEntity.ok(effortsJson);
            
        } catch (Exception e) {
            log.error("Failed to get segment efforts for user: {}", authentication.getName(), e);
            return ResponseEntity.ok("[]");
        }
    }

    /**
     * Get specific segment effort by ID
     * Used to get PR effort details
     */
    @GetMapping("/segment-efforts/{effortId}")
    public ResponseEntity<String> getSegmentEffortById(
            Authentication authentication,
            @PathVariable Long effortId) {
        
        try {
            String effortJson = stravaService.getSegmentEffortById(
                    authentication.getName(), 
                    effortId
            );
            
            return ResponseEntity.ok(effortJson);
            
        } catch (Exception e) {
            log.error("Failed to get segment effort for user: {}", authentication.getName(), e);
            return ResponseEntity.ok("{}");
        }
    }

    /**
     * Batch fetch PR and KOM/QOM data for multiple segments in parallel.
     * Accepts a JSON body: { "segmentIds": [123, 456, ...] }
     * Returns a map of segmentId -> { prTime, prWatts, komTime, qomTime, hasPR }
     */
    @PostMapping("/segments/batch-pr")
    public ResponseEntity<Map<String, Object>> batchSegmentPRs(
            Authentication authentication,
            @RequestBody Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            List<Number> rawIds = (List<Number>) body.get("segmentIds");
            if (rawIds == null || rawIds.isEmpty()) {
                return ResponseEntity.ok(Map.of());
            }
            List<Long> segmentIds = rawIds.stream().map(Number::longValue).toList();
            Map<Long, Map<String, Object>> result = stravaService.batchGetSegmentPRs(
                    authentication.getName(), segmentIds);
            // Convert Long keys to String for JSON serialization
            Map<String, Object> response = new HashMap<>();
            result.forEach((k, v) -> response.put(String.valueOf(k), v));
            return ResponseEntity.ok(response);
        } catch (StravaRateLimitException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to batch fetch segment PRs for user: {}", authentication.getName(), e);
            return ResponseEntity.ok(Map.of());
        }
    }

    /**
     * Global exception handler for Strava API rate limit errors
     * Returns 429 status with retry information for frontend to display
     */
    @ExceptionHandler(StravaRateLimitException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimitException(StravaRateLimitException ex) {
        // Single log line - no stacktrace
        log.warn("Strava rate limit hit - retry after {} seconds", ex.getRetryAfterSeconds());
        
        Map<String, Object> response = new HashMap<>();
        response.put("error", "rate_limit");
        response.put("message", "Strava API rate limit exceeded");
        response.put("retryAfterSeconds", ex.getRetryAfterSeconds());
        response.put("retryAfterFormatted", ex.getTimeUntilReset());
        
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(response);
    }
}
