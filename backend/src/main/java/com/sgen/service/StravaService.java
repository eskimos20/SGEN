package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.User;
import com.sgen.exception.StravaRateLimitException;
import com.sgen.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

@Service
@Slf4j
public class StravaService {

    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    
    // Lock map to prevent concurrent token refreshes for the same user
    private final ConcurrentHashMap<String, Object> userRefreshLocks = new ConcurrentHashMap<>();
    
    // Cache for Strava API responses (key -> {data, timestamp})
    // TTL: 5 minutes = 300 seconds (shorter for segments to keep PR data fresh)
    private static final long CACHE_TTL_SECONDS = 300;
    private final ConcurrentHashMap<String, CacheEntry> segmentCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CacheEntry> activityCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CacheEntry> activitiesListCache = new ConcurrentHashMap<>();
    
    private static class CacheEntry {
        final String data;
        final long timestamp;
        
        CacheEntry(String data, long timestamp) {
            this.data = data;
            this.timestamp = timestamp;
        }
        
        boolean isExpired() {
            return (Instant.now().getEpochSecond() - timestamp) > CACHE_TTL_SECONDS;
        }
    }

    @Value("${strava.api.base-url:https://www.strava.com/api/v3}")
    private String stravaBaseUrl;

    @Value("${strava.oauth.authorize-url:https://www.strava.com/oauth/authorize}")
    private String stravaAuthorizeUrl;

    @Value("${strava.oauth.token-url:https://www.strava.com/oauth/token}")
    private String stravaTokenUrl;

    @Value("${strava.oauth.redirect-uri:http://localhost:8084/api/strava/callback}")
    private String redirectUri;

    public StravaService(UserRepository userRepository, ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
    }
    
    // Cache helper methods
    private String getFromCache(ConcurrentHashMap<String, CacheEntry> cache, String key) {
        CacheEntry entry = cache.get(key);
        if (entry != null && !entry.isExpired()) {
            return entry.data;
        }
        return null;
    }
    
    private void putInCache(ConcurrentHashMap<String, CacheEntry> cache, String key, String data) {
        cache.put(key, new CacheEntry(data, Instant.now().getEpochSecond()));
    }
    
    private String buildCacheKey(String username, Object... parts) {
        StringBuilder key = new StringBuilder(username);
        for (Object part : parts) {
            key.append(":").append(part);
        }
        return key.toString();
    }

    public String buildAuthorizationUrl(String clientId) {
        try {
            return stravaAuthorizeUrl + 
                   "?client_id=" + URLEncoder.encode(clientId, StandardCharsets.UTF_8) +
                   "&redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8) +
                   "&response_type=code" +
                   "&scope=read,activity:read_all,profile:read_all";
        } catch (Exception e) {
            log.error("Failed to build authorization URL", e);
            return null;
        }
    }

    @Transactional
    public boolean exchangeAuthorizationCode(String username, String code) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.getStravaClientId() == null || user.getStravaClientSecret() == null) {
            throw new RuntimeException("Strava credentials not configured");
        }

        try {
            String requestBody = "client_id=" + URLEncoder.encode(user.getStravaClientId(), StandardCharsets.UTF_8) +
                               "&client_secret=" + URLEncoder.encode(user.getStravaClientSecret(), StandardCharsets.UTF_8) +
                               "&code=" + URLEncoder.encode(code, StandardCharsets.UTF_8) +
                               "&grant_type=authorization_code";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaTokenUrl))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode tokenData = objectMapper.readTree(response.body());
                
                user.setStravaAccessToken(tokenData.get("access_token").asText());
                user.setStravaRefreshToken(tokenData.get("refresh_token").asText());
                user.setStravaTokenExpiresAt(tokenData.get("expires_at").asLong());
                userRepository.save(user);

                log.info("Successfully exchanged authorization code for user: {}", username);
                return true;
            } else {
                log.error("Failed to exchange authorization code: {} - {}", response.statusCode(), response.body());
                return false;
            }
        } catch (Exception e) {
            log.error("Failed to exchange authorization code for user: {}", username, e);
            return false;
        }
    }

    @Transactional
    public String refreshAccessToken(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.getStravaRefreshToken() == null) {
            throw new RuntimeException("No refresh token available");
        }

        try {
            String requestBody = "client_id=" + URLEncoder.encode(user.getStravaClientId(), StandardCharsets.UTF_8) +
                               "&client_secret=" + URLEncoder.encode(user.getStravaClientSecret(), StandardCharsets.UTF_8) +
                               "&refresh_token=" + URLEncoder.encode(user.getStravaRefreshToken(), StandardCharsets.UTF_8) +
                               "&grant_type=refresh_token";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaTokenUrl))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode tokenData = objectMapper.readTree(response.body());
                
                String newAccessToken = tokenData.get("access_token").asText();
                String newRefreshToken = tokenData.get("refresh_token").asText();
                Long expiresAt = tokenData.get("expires_at").asLong();

                user.setStravaAccessToken(newAccessToken);
                user.setStravaRefreshToken(newRefreshToken);
                user.setStravaTokenExpiresAt(expiresAt);
                userRepository.save(user);

                log.info("Successfully refreshed access token for user: {}", username);
                return newAccessToken;
            } else {
                log.error("Failed to refresh token: {} - {}", response.statusCode(), response.body());
                throw new RuntimeException("Failed to refresh token");
            }
        } catch (Exception e) {
            log.error("Failed to refresh access token for user: {}", username, e);
            throw new RuntimeException("Failed to refresh access token: " + e.getMessage());
        }
    }

    public String getValidAccessToken(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Quick check without locking - if token is valid, return it immediately
        boolean needsRefresh = user.getStravaAccessToken() == null;
        boolean isExpired = user.getStravaTokenExpiresAt() != null && 
                           user.getStravaTokenExpiresAt() <= Instant.now().getEpochSecond() + 300;
        
        if (!needsRefresh && !isExpired) {
            return user.getStravaAccessToken();
        }

        // Need to refresh - use per-user lock to prevent concurrent refreshes
        if (user.getStravaRefreshToken() == null) {
            throw new RuntimeException("No access token available and no refresh token");
        }

        // Get or create a lock object for this user
        Object userLock = userRefreshLocks.computeIfAbsent(username, k -> new Object());
        
        synchronized (userLock) {
            // Double-check pattern - re-fetch user inside lock as another thread may have refreshed
            user = userRepository.findByUsername(username)
                    .orElseThrow(() -> new RuntimeException("User not found"));
            
            // Check again if token is still expired after acquiring lock
            needsRefresh = user.getStravaAccessToken() == null;
            isExpired = user.getStravaTokenExpiresAt() != null && 
                       user.getStravaTokenExpiresAt() <= Instant.now().getEpochSecond() + 300;
            
            if (!needsRefresh && !isExpired) {
                return user.getStravaAccessToken(); // Another thread already refreshed
            }
            
            log.info("Access token {} for user: {}, refreshing...", 
                    needsRefresh ? "is null" : "expired or expiring soon", username);
            return refreshAccessToken(username);
        }
    }

    public Map<String, Object> testConnection(String username) {
        Map<String, Object> result = new HashMap<>();
        try {
            String accessToken = getValidAccessToken(username);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaBaseUrl + "/athlete"))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode athlete = objectMapper.readTree(response.body());
                String firstName = athlete.path("firstname").asText("");
                String lastName = athlete.path("lastname").asText("");
                String athleteName = (firstName + " " + lastName).trim();
                
                result.put("success", true);
                result.put("athleteName", athleteName.isEmpty() ? "Strava User" : athleteName);
                log.info("Strava connection test successful for user: {}, athlete: {}", username, athleteName);
            } else {
                result.put("success", false);
                result.put("message", "Connection failed: " + response.statusCode());
                log.error("Strava connection test failed for user {}: {}", username, response.statusCode());
            }
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
            log.error("Failed to test Strava connection for user: {}", username, e);
        }
        return result;
    }

    public String getAthleteActivities(String username, Long after, Long before, Integer page, Integer perPage) {
        // Build cache key based on query parameters
        String cacheKey = buildCacheKey(username, "activities", after, before, page, perPage);
        
        // Check cache first
        String cached = getFromCache(activitiesListCache, cacheKey);
        if (cached != null) {
            log.debug("Cache hit for activities list: user={}, after={}, before={}", username, after, before);
            return cached;
        }
        
        try {
            String accessToken = getValidAccessToken(username);
            
            StringBuilder uriBuilder = new StringBuilder(stravaBaseUrl + "/athlete/activities?");
            if (after != null) {
                uriBuilder.append("after=").append(after).append("&");
            }
            if (before != null) {
                uriBuilder.append("before=").append(before).append("&");
            }
            if (page != null) {
                uriBuilder.append("page=").append(page).append("&");
            }
            if (perPage != null) {
                uriBuilder.append("per_page=").append(perPage);
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(uriBuilder.toString()))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                String data = response.body();
                // Store in cache
                putInCache(activitiesListCache, cacheKey, data);
                log.debug("Cached activities list for user: {} (20 min TTL)", username);
                return data;
            } else if (response.statusCode() == 429) {
                // Rate limit - single log line, no stacktrace
                log.warn("Strava rate limit exceeded for user: {} (activities list)", username);
                long retryAfter = response.headers().firstValueAsLong("Retry-After").orElse(900); // Default 15 min
                throw new StravaRateLimitException("Strava rate limit exceeded", retryAfter);
            } else {
                log.error("Failed to fetch activities for user {}: {} - {}", username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch activities: HTTP " + response.statusCode());
            }
        } catch (StravaRateLimitException e) {
            throw e; // Re-throw rate limit exception as-is
        } catch (Exception e) {
            log.error("Failed to fetch activities for user: {}", username, e);
            throw new RuntimeException("Failed to fetch activities: " + e.getMessage());
        }
    }

    public String getActivityById(String username, Long activityId, Boolean includeAllEfforts) {
        // Build cache key - includeAllEfforts affects the response
        String cacheKey = buildCacheKey(username, "activity", activityId, includeAllEfforts);
        
        // Check cache first
        String cached = getFromCache(activityCache, cacheKey);
        if (cached != null) {
            log.debug("Cache hit for activity: user={}, activityId={}", username, activityId);
            return cached;
        }
        
        try {
            String accessToken = getValidAccessToken(username);
            
            String uri = stravaBaseUrl + "/activities/" + activityId;
            if (includeAllEfforts != null && includeAllEfforts) {
                uri += "?include_all_efforts=true";
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(uri))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                String data = response.body();
                // Store in cache
                putInCache(activityCache, cacheKey, data);
                log.debug("Cached activity {} for user: {} (20 min TTL)", activityId, username);
                return data;
            } else if (response.statusCode() == 429) {
                // Rate limit - single log line, no stacktrace
                log.warn("Strava rate limit exceeded for user: {} (activity {})", username, activityId);
                long retryAfter = response.headers().firstValueAsLong("Retry-After").orElse(900);
                throw new StravaRateLimitException("Strava rate limit exceeded", retryAfter);
            } else {
                log.error("Failed to fetch activity {} for user {}: {} - {}", activityId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch activity: HTTP " + response.statusCode());
            }
        } catch (StravaRateLimitException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to fetch activity {} for user: {}", activityId, username, e);
            throw new RuntimeException("Failed to fetch activity: " + e.getMessage());
        }
    }

    public String getActivityZones(String username, Long activityId) {
        try {
            String accessToken = getValidAccessToken(username);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaBaseUrl + "/activities/" + activityId + "/zones"))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return response.body();
            } else if (response.statusCode() == 402) {
                // Payment Required - Strava API requires subscription for zones
                log.warn("Zones endpoint requires Strava subscription for activity {} user {}", activityId, username);
                return "[]"; // Return empty array
            } else {
                log.error("Failed to fetch zones for activity {} for user {}: {} - {}", activityId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch zones: HTTP " + response.statusCode());
            }
        } catch (Exception e) {
            log.error("Failed to fetch zones for activity {} for user: {}", activityId, username, e);
            throw new RuntimeException("Failed to fetch zones: " + e.getMessage());
        }
    }

    public String getActivityStreams(String username, Long activityId, String keys) {
        try {
            String accessToken = getValidAccessToken(username);
            
            String uri = stravaBaseUrl + "/activities/" + activityId + "/streams?keys=" + 
                        URLEncoder.encode(keys, StandardCharsets.UTF_8) + "&key_by_type=true";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(uri))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return response.body();
            } else {
                log.error("Failed to fetch streams for activity {} for user {}: {} - {}", activityId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch streams: HTTP " + response.statusCode());
            }
        } catch (Exception e) {
            log.error("Failed to fetch streams for activity {} for user: {}", activityId, username, e);
            throw new RuntimeException("Failed to fetch streams: " + e.getMessage());
        }
    }

    public String getActivityLaps(String username, Long activityId) {
        try {
            String accessToken = getValidAccessToken(username);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaBaseUrl + "/activities/" + activityId + "/laps"))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return response.body();
            } else {
                log.error("Failed to fetch laps for activity {} for user {}: {} - {}", activityId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch laps: HTTP " + response.statusCode());
            }
        } catch (Exception e) {
            log.error("Failed to fetch laps for activity {} for user: {}", activityId, username, e);
            throw new RuntimeException("Failed to fetch laps: " + e.getMessage());
        }
    }

    /**
     * Get all segment efforts from a specific activity
     * Returns array of segment efforts with segment details and athlete's performance
     * Note: Strava API requires fetching full activity details - segment_efforts array is included
     */
    public String getActivitySegmentEfforts(String username, Long activityId) {
        try {
            String accessToken = getValidAccessToken(username);
            // Fetch full activity details with include_all_efforts=true to get segment efforts
            String url = stravaBaseUrl + "/activities/" + activityId + "?include_all_efforts=true";
            
            log.debug("Fetching activity details with segment efforts from URL: {}", url);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                // Extract segment_efforts array from the activity response
                com.fasterxml.jackson.databind.JsonNode activity = objectMapper.readTree(response.body());
                com.fasterxml.jackson.databind.JsonNode segmentEfforts = activity.path("segment_efforts");
                
                log.debug("Successfully fetched activity {} with {} segment efforts", 
                        activityId, segmentEfforts.size());
                
                return segmentEfforts.toString();
            } else if (response.statusCode() == 404) {
                log.debug("Activity {} not found (HTTP 404)", activityId);
                return "[]"; // Return empty array
            } else if (response.statusCode() == 403) {
                log.warn("Access denied (403) for activity {} - token may lack scope", activityId);
                return "[]";
            } else {
                log.warn("Failed to fetch activity {}: {} - {}", activityId, response.statusCode(), response.body());
                return "[]"; // Return empty array on error
            }
        } catch (Exception e) {
            log.error("❌ Failed to fetch segment efforts for activity {} for user: {}", activityId, username, e);
            return "[]"; // Return empty array on exception
        }
    }

    public String getSegmentLeaderboard(String username, Long segmentId, String gender, String ageGroup, String weightClass, Boolean following, Integer clubId, String dateRange, Integer contextEntries, Integer page, Integer perPage) {
        try {
            String accessToken = getValidAccessToken(username);

            // Build query parameters
            // NOTE: gender, age_group, weight_class filters require Strava Premium
            // For free users, only use per_page, page, and context_entries
            StringBuilder queryParams = new StringBuilder();
            queryParams.append("?per_page=").append(perPage != null ? perPage : 10);
            
            // Only add premium filters if explicitly requested
            // These will cause 403 for free users
            if (gender != null && !gender.isEmpty()) {
                log.info("Adding gender filter (requires premium): {}", gender);
                queryParams.append("&gender=").append(gender);
            }
            if (ageGroup != null && !ageGroup.isEmpty()) {
                log.info("Adding age_group filter (requires premium): {}", ageGroup);
                queryParams.append("&age_group=").append(ageGroup);
            }
            if (weightClass != null && !weightClass.isEmpty()) {
                log.info("Adding weight_class filter (requires premium): {}", weightClass);
                queryParams.append("&weight_class=").append(weightClass);
            }
            if (following != null && following) {
                queryParams.append("&following=true");
            }
            if (clubId != null) {
                queryParams.append("&club_id=").append(clubId);
            }
            if (dateRange != null && !dateRange.isEmpty()) {
                queryParams.append("&date_range=").append(dateRange);
            }
            if (contextEntries != null) {
                queryParams.append("&context_entries=").append(contextEntries);
            }
            if (page != null) {
                queryParams.append("&page=").append(page);
            }

            String url = stravaBaseUrl + "/segments/" + segmentId + "/leaderboard" + queryParams.toString();
            
            // DETAILED LOGGING FOR DEBUGGING
            log.info("========== SEGMENT LEADERBOARD REQUEST ==========");
            log.info("User: {}", username);
            log.info("Segment ID: {}", segmentId);
            log.info("Full URL: {}", url);
            log.info("Access Token (first 20 chars): {}...", accessToken.substring(0, Math.min(20, accessToken.length())));
            log.info("Access Token (full - FOR DEBUGGING ONLY): {}", accessToken);
            log.info("=================================================");

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            log.info("Sending request to Strava API...");
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            log.info("========== SEGMENT LEADERBOARD RESPONSE ==========");
            log.info("Status Code: {}", response.statusCode());
            log.info("Response Headers: {}", response.headers().map());
            log.info("Response Body: {}", response.body());
            log.info("==================================================");

            if (response.statusCode() == 200) {
                log.info("✅ Successfully fetched leaderboard for segment {}", segmentId);
                return response.body();
            } else if (response.statusCode() == 403) {
                // Forbidden - Segment leaderboard requires special permissions or is private
                log.warn("❌ 403 FORBIDDEN - Segment leaderboard access forbidden for segment {} user {}", segmentId, username);
                log.warn("Response body: {}", response.body());
                return "{\"entries\":[]}"; // Return empty leaderboard
            } else {
                log.error("❌ Failed to fetch leaderboard for segment {} for user {}: {} - {}", segmentId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch leaderboard: HTTP " + response.statusCode());
            }
        } catch (Exception e) {
            log.error("❌ Exception while fetching leaderboard for segment {} for user: {}", segmentId, username, e);
            throw new RuntimeException("Failed to fetch leaderboard: " + e.getMessage());
        }
    }

    public String getSegmentEffortById(String username, Long segmentEffortId) {
        try {
            String accessToken = getValidAccessToken(username);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaBaseUrl + "/segment_efforts/" + segmentEffortId))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return response.body();
            } else if (response.statusCode() == 404) {
                log.warn("Segment effort {} not found for user {}", segmentEffortId, username);
                return "{}"; // Return empty object
            } else {
                log.error("Failed to fetch segment effort {} for user {}: {} - {}", segmentEffortId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch segment effort: HTTP " + response.statusCode());
            }
        } catch (Exception e) {
            log.error("Failed to fetch segment effort {} for user: {}", segmentEffortId, username, e);
            throw new RuntimeException("Failed to fetch segment effort: " + e.getMessage());
        }
    }

    /**
     * Fetch all efforts for a segment (for current athlete)
     * Used to find PR when athlete_pr_effort is not available
     */
    public String getSegmentAllEfforts(String username, Long segmentId) {
        try {
            String accessToken = getValidAccessToken(username);
            String url = stravaBaseUrl + "/segments/" + segmentId + "/all_efforts?per_page=50";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return response.body();
            } else if (response.statusCode() == 404) {
                log.debug("No efforts found for segment {} for user {}", segmentId, username);
                return "[]";
            } else {
                log.warn("Failed to fetch segment efforts for {}: {}", segmentId, response.statusCode());
                return "[]";
            }
        } catch (Exception e) {
            log.error("Failed to fetch segment efforts for {} for user: {}", segmentId, username, e);
            return "[]";
        }
    }

    public String getSegmentById(String username, Long segmentId) {
        // Build cache key
        String cacheKey = buildCacheKey(username, "segment", segmentId);
        
        // Check cache first
        String cached = getFromCache(segmentCache, cacheKey);
        if (cached != null) {
            log.debug("Cache hit for segment: user={}, segmentId={}", username, segmentId);
            return cached;
        }
        
        try {
            String accessToken = getValidAccessToken(username);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaBaseUrl + "/segments/" + segmentId))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                String data = response.body();
                // Store in cache
                putInCache(segmentCache, cacheKey, data);
                log.debug("Cached segment {} for user: {} (20 min TTL)", segmentId, username);
                return data;
            } else if (response.statusCode() == 429) {
                // Rate limit - single log line, no stacktrace
                log.warn("Strava rate limit exceeded for user: {} (segment {})", username, segmentId);
                long retryAfter = response.headers().firstValueAsLong("Retry-After").orElse(900);
                throw new StravaRateLimitException("Strava rate limit exceeded", retryAfter);
            } else if (response.statusCode() == 404) {
                log.warn("Segment {} not found for user {}", segmentId, username);
                return "{}"; // Return empty object - don't cache 404s
            } else {
                log.error("Failed to fetch segment {} for user {}: {} - {}", segmentId, username, response.statusCode(), response.body());
                throw new RuntimeException("Failed to fetch segment: HTTP " + response.statusCode());
            }
        } catch (StravaRateLimitException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to fetch segment {} for user: {}", segmentId, username, e);
            throw new RuntimeException("Failed to fetch segment: " + e.getMessage());
        }
    }

    /**
     * Fetch PR and KOM/QOM data for multiple segments in parallel.
     * Max 10 concurrent requests to respect Strava rate limits.
     * Returns a map of segmentId -> { prTime, prActivityId, prWatts, komTime, qomTime, hasPR }
     */
    public Map<Long, Map<String, Object>> batchGetSegmentPRs(String username, List<Long> segmentIds) {
        if (segmentIds == null || segmentIds.isEmpty()) {
            return new HashMap<>();
        }

        // Semaphore to limit concurrent requests to Strava (max 10)
        Semaphore semaphore = new Semaphore(10);
        // Track rate limiting so we can surface it to the caller instead of
        // silently returning incomplete PR/watt data.
        AtomicBoolean rateLimited = new AtomicBoolean(false);
        AtomicLong retryAfterSeconds = new AtomicLong(900);
        String accessToken;
        try {
            accessToken = getValidAccessToken(username);
        } catch (Exception e) {
            log.error("Failed to get access token for batch segment fetch: {}", e.getMessage());
            return new HashMap<>();
        }

        // Launch all segment fetches in parallel
        List<CompletableFuture<Map.Entry<Long, Map<String, Object>>>> futures = new ArrayList<>();

        for (Long segmentId : segmentIds) {
            // Check cache first - skip API call if cached
            String cacheKey = buildCacheKey(username, "segment", segmentId);
            String cachedJson = getFromCache(segmentCache, cacheKey);

            CompletableFuture<Map.Entry<Long, Map<String, Object>>> future = CompletableFuture.supplyAsync(() -> {
                try {
                    semaphore.acquire();
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return null;
                }
                try {
                    String segmentJson;
                    if (cachedJson != null) {
                        segmentJson = cachedJson;
                    } else {
                        HttpRequest req = HttpRequest.newBuilder()
                                .uri(URI.create(stravaBaseUrl + "/segments/" + segmentId))
                                .header("Authorization", "Bearer " + accessToken)
                                .timeout(Duration.ofSeconds(15))
                                .GET()
                                .build();
                        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
                        if (resp.statusCode() == 200) {
                            segmentJson = resp.body();
                            putInCache(segmentCache, cacheKey, segmentJson);
                        } else if (resp.statusCode() == 429) {
                            log.warn("Strava rate limit hit during batch fetch for segment {}", segmentId);
                            rateLimited.set(true);
                            retryAfterSeconds.set(resp.headers().firstValueAsLong("Retry-After").orElse(900));
                            return null;
                        } else {
                            log.debug("Segment {} returned HTTP {}", segmentId, resp.statusCode());
                            return null;
                        }
                    }

                    JsonNode seg = objectMapper.readTree(segmentJson);
                    JsonNode stats = seg.path("athlete_segment_stats");
                    JsonNode xoms = seg.path("xoms");

                    Map<String, Object> prData = new HashMap<>();
                    prData.put("prTime", stats.path("pr_elapsed_time").isNull() || stats.path("pr_elapsed_time").isMissingNode() ? null : stats.path("pr_elapsed_time").asLong());
                    prData.put("prActivityId", stats.path("pr_activity_id").isNull() || stats.path("pr_activity_id").isMissingNode() ? null : stats.path("pr_activity_id").asLong());
                    prData.put("komTime", xoms.path("kom").asText(null));
                    prData.put("qomTime", xoms.path("qom").asText(null));
                    prData.put("hasPR", !stats.path("pr_elapsed_time").isNull() && !stats.path("pr_elapsed_time").isMissingNode());

                    return Map.entry(segmentId, prData);
                } catch (Exception e) {
                    log.debug("Failed to fetch segment {} in batch: {}", segmentId, e.getMessage());
                    return null;
                } finally {
                    semaphore.release();
                }
            });

            futures.add(future);
        }

        // Collect results - wait for all to complete
        Map<Long, Map<String, Object>> result = new ConcurrentHashMap<>();
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();

        // Step 2: collect all unique PR activity IDs we need to fetch for watt data
        Map<Long, Long> segmentToPrActivity = new HashMap<>(); // segmentId -> prActivityId
        for (CompletableFuture<Map.Entry<Long, Map<String, Object>>> f : futures) {
            try {
                Map.Entry<Long, Map<String, Object>> entry = f.get();
                if (entry != null) {
                    result.put(entry.getKey(), entry.getValue());
                    Long prActivityId = (Long) entry.getValue().get("prActivityId");
                    Long prTime = (Long) entry.getValue().get("prTime");
                    if (prActivityId != null && prTime != null) {
                        segmentToPrActivity.put(entry.getKey(), prActivityId);
                    }
                }
            } catch (Exception e) {
                log.debug("Error collecting batch result: {}", e.getMessage());
            }
        }

        // Step 3: fetch unique PR activities in parallel to get watt data
        List<Long> uniqueActivityIds = segmentToPrActivity.values().stream().distinct().toList();
        Map<Long, JsonNode> activityCache = new ConcurrentHashMap<>();

        if (!uniqueActivityIds.isEmpty()) {
            List<CompletableFuture<Void>> actFutures = new ArrayList<>();
            for (Long activityId : uniqueActivityIds) {
                CompletableFuture<Void> actFuture = CompletableFuture.runAsync(() -> {
                    try {
                        semaphore.acquire();
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                    try {
                        HttpRequest req = HttpRequest.newBuilder()
                                .uri(URI.create(stravaBaseUrl + "/activities/" + activityId + "?include_all_efforts=true"))
                                .header("Authorization", "Bearer " + accessToken)
                                .timeout(Duration.ofSeconds(15))
                                .GET()
                                .build();
                        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
                        if (resp.statusCode() == 200) {
                            activityCache.put(activityId, objectMapper.readTree(resp.body()));
                        } else if (resp.statusCode() == 429) {
                            log.warn("Strava rate limit hit during batch fetch for PR activity {}", activityId);
                            rateLimited.set(true);
                            retryAfterSeconds.set(resp.headers().firstValueAsLong("Retry-After").orElse(900));
                        }
                    } catch (Exception e) {
                        log.debug("Failed to fetch PR activity {}: {}", activityId, e.getMessage());
                    } finally {
                        semaphore.release();
                    }
                });
                actFutures.add(actFuture);
            }
            CompletableFuture.allOf(actFutures.toArray(new CompletableFuture[0])).join();

            // Step 4: extract watt data from fetched PR activities
            for (Map.Entry<Long, Long> entry : segmentToPrActivity.entrySet()) {
                Long segmentId = entry.getKey();
                Long prActivityId = entry.getValue();
                JsonNode activity = activityCache.get(prActivityId);
                if (activity == null) continue;

                Map<String, Object> prData = result.get(segmentId);
                if (prData == null) continue;
                Long prTime = (Long) prData.get("prTime");
                if (prTime == null) continue;

                JsonNode efforts = activity.path("segment_efforts");
                for (JsonNode effort : efforts) {
                    if (effort.path("segment").path("id").asLong() == segmentId
                            && effort.path("elapsed_time").asLong() == prTime) {
                        double watts = effort.path("average_watts").asDouble(0);
                        if (watts > 0) {
                            prData.put("prWatts", watts);
                        }
                        break;
                    }
                }
            }
        }

        // If Strava rate-limited any request, surface it so the frontend can show
        // a clear "try again" message instead of looking like the PR is missing.
        if (rateLimited.get()) {
            throw new StravaRateLimitException("Strava rate limit exceeded during batch PR fetch", retryAfterSeconds.get());
        }

        log.debug("Batch segment PR fetch complete: {} segments processed for user {}", result.size(), username);
        return result;
    }

    /**
     * Fetch photos for a specific activity from Strava
     * Returns JSON array of photo objects with URLs
     */
    public String getActivityPhotos(String username, Long activityId) {
        try {
            String accessToken = getValidAccessToken(username);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stravaBaseUrl + "/activities/" + activityId + "/photos?size=2048"))
                    .header("Authorization", "Bearer " + accessToken)
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                log.debug("Successfully fetched photos for activity {}", activityId);
                return response.body();
            } else if (response.statusCode() == 404) {
                log.warn("Activity {} not found or no photos for user {}", activityId, username);
                return "[]"; // Return empty array
            } else if (response.statusCode() == 401) {
                log.error("❌ Unauthorized - token may be expired for user {}", username);
                return "[]";
            } else {
                log.error("❌ Failed to fetch photos for activity {} for user {}: {} - {}", activityId, username, response.statusCode(), response.body());
                return "[]"; // Return empty array on error
            }
        } catch (Exception e) {
            log.error("❌ Failed to fetch photos for activity {} for user: {}", activityId, username, e);
            return "[]"; // Return empty array on exception
        }
    }
}
