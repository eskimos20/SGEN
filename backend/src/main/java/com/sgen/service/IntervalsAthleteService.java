package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsAthleteService {

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;

    @Value("${intervals.api.base-url}")
    private String intervalsBaseUrl;

    private volatile List<String> cachedActivityTypes = null;
    private volatile long activityTypesCacheTime = 0;
    private static final long CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

    public Map<String, Object> getAthleteProfile(String username) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        String athleteId = ctx.user.getIntervalsAthleteId();
        Map<String, Object> profile = new HashMap<>();

        try {
            String athleteJson = ctx.client.get()
                    .uri("/api/v1/athlete/{id}", athleteId)
                    .retrieve().bodyToMono(String.class).block();
            profile.put("athlete", objectMapper.readTree(athleteJson));
        } catch (Exception e) {
            profile.put("athleteError", e.getMessage());
        }

        try {
            String settingsJson = ctx.client.get()
                    .uri("/api/v1/athlete/{id}/settings", athleteId)
                    .retrieve().bodyToMono(String.class).block();
            profile.put("settings", objectMapper.readTree(settingsJson));
        } catch (Exception e) {
            profile.put("settingsError", e.getMessage());
        }

        try {
            String sportSettingsJson = ctx.client.get()
                    .uri("/api/v1/athlete/{id}/sport-settings", athleteId)
                    .retrieve().bodyToMono(String.class).block();
            profile.put("sportSettings", objectMapper.readTree(sportSettingsJson));
        } catch (Exception e) {
            profile.put("sportSettingsError", e.getMessage());
        }

        return profile;
    }

    public JsonNode updateAthleteProfile(String username, Map<String, Object> updates) {
        Map<String, Object> filtered = new HashMap<>();
        for (Map.Entry<String, Object> entry : updates.entrySet()) {
            String key = entry.getKey();
            if ("name".equals(key) || "city".equals(key) || "country".equals(key) ||
                    "weight".equals(key) || "height".equals(key) || "sex".equals(key) || "locale".equals(key) ||
                    "icu_date_of_birth".equals(key) || "icu_weight_target".equals(key) ||
                    "icu_resting_hr".equals(key)) {
                filtered.put(key, entry.getValue());
            } else {
                log.warn("Skipping unsupported athlete profile field: {} = {}", key, entry.getValue());
            }
        }

        if (filtered.isEmpty()) {
            log.warn("No valid fields to update for athlete profile, skipping API call");
            try { return objectMapper.readTree("{}"); }
            catch (Exception e) { throw new RuntimeException("Failed to create empty response"); }
        }

        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            log.info("Updating athlete profile for \"{}\", fields: {}", username, filtered.keySet());
            String responseJson = ctx.client.put()
                    .uri("/api/v1/athlete/{id}", ctx.user.getIntervalsAthleteId())
                    .bodyValue(filtered)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(responseJson);
        } catch (WebClientResponseException e) {
            log.error("Failed to update athlete profile: {} - Response body: {}", e.getMessage(), e.getResponseBodyAsString());
            throw new RuntimeException("Failed to update athlete profile: " + e.getMessage());
        } catch (Exception e) {
            log.error("Failed to update athlete profile: {}", e.getMessage());
            throw new RuntimeException("Failed to update athlete profile: " + e.getMessage());
        }
    }

    public JsonNode updateAthleteSettings(String username, Map<String, Object> updates) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String responseJson = ctx.client.put()
                    .uri("/api/v1/athlete/{id}/settings", ctx.user.getIntervalsAthleteId())
                    .bodyValue(updates)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to update athlete settings: {}", e.getMessage());
            throw new RuntimeException("Failed to update athlete settings: " + e.getMessage());
        }
    }

    public JsonNode updateAthleteSportSettings(String username, Object updates) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String responseJson = ctx.client.put()
                    .uri("/api/v1/athlete/{id}/sport-settings/{sid}",
                            ctx.user.getIntervalsAthleteId(), ((Map<?, ?>) updates).get("id"))
                    .bodyValue(updates)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to update athlete sport settings: {}", e.getMessage());
            throw new RuntimeException("Failed to update athlete sport settings: " + e.getMessage());
        }
    }

    public JsonNode createAthleteSportSettings(String username, Object sportData) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String responseJson = ctx.client.post()
                    .uri("/api/v1/athlete/{id}/sport-settings", ctx.user.getIntervalsAthleteId())
                    .bodyValue(sportData)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to create athlete sport settings: {}", e.getMessage());
            throw new RuntimeException("Failed to create athlete sport settings: " + e.getMessage());
        }
    }

    public void deleteAthleteSportSettings(String username, int sportId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            ctx.client.delete()
                    .uri("/api/v1/athlete/{athleteId}/sport-settings/{sportId}",
                            ctx.user.getIntervalsAthleteId(), sportId)
                    .retrieve().bodyToMono(Void.class).block();
        } catch (Exception e) {
            log.error("Failed to delete athlete sport settings {}: {}", sportId, e.getMessage());
            throw new RuntimeException("Failed to delete athlete sport settings: " + e.getMessage());
        }
    }

    public JsonNode getMatchingActivitiesForSportSettings(String username, int sportId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String responseJson = ctx.client.get()
                    .uri("/api/v1/athlete/{athleteId}/sport-settings/{id}/matching-activities",
                            ctx.user.getIntervalsAthleteId(), sportId)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to get matching activities for sport settings {}: {}", sportId, e.getMessage());
            throw new RuntimeException("Failed to get matching activities: " + e.getMessage());
        }
    }

    public JsonNode applySettingsToActivities(String username, int sportId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String responseJson = ctx.client.put()
                    .uri("/api/v1/athlete/{athleteId}/sport-settings/{id}/apply",
                            ctx.user.getIntervalsAthleteId(), sportId)
                    .retrieve().bodyToMono(String.class).block();
            if (responseJson == null || responseJson.isBlank()) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to apply sport settings {} to activities: {}", sportId, e.getMessage());
            throw new RuntimeException("Failed to apply sport settings to activities: " + e.getMessage());
        }
    }

    public void updateSportSettingsFtp(String username, String sportType, Integer newFtp) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String sportSettingsJson = ctx.client.get()
                    .uri("/api/v1/athlete/{id}/sport-settings", ctx.user.getIntervalsAthleteId())
                    .retrieve().bodyToMono(String.class).block();
            JsonNode sportSettings = objectMapper.readTree(sportSettingsJson);
            for (JsonNode setting : sportSettings) {
                JsonNode types = setting.get("types");
                if (types != null && types.isArray()) {
                    for (JsonNode type : types) {
                        if (type.asText().equalsIgnoreCase(sportType)) {
                            int sportId = setting.get("id").asInt();
                            Map<String, Object> upd = new HashMap<>();
                            upd.put("id", sportId);
                            upd.put("ftp", newFtp);
                            updateAthleteSportSettings(username, upd);
                            log.info("Updated FTP to {} for sport {} (id: {})", newFtp, sportType, sportId);
                            return;
                        }
                    }
                }
            }
            log.warn("No sport setting found for type: {}", sportType);
        } catch (Exception e) {
            log.error("Failed to update FTP for sport {}: {}", sportType, e.getMessage());
            throw new RuntimeException("Failed to update FTP: " + e.getMessage());
        }
    }

    public void updateSportSettingsLthr(String username, String sportType, Integer newLthr) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String sportSettingsJson = ctx.client.get()
                    .uri("/api/v1/athlete/{id}/sport-settings", ctx.user.getIntervalsAthleteId())
                    .retrieve().bodyToMono(String.class).block();
            JsonNode sportSettings = objectMapper.readTree(sportSettingsJson);
            for (JsonNode setting : sportSettings) {
                JsonNode types = setting.get("types");
                if (types != null && types.isArray()) {
                    for (JsonNode type : types) {
                        if (type.asText().equalsIgnoreCase(sportType)) {
                            int sportId = setting.get("id").asInt();
                            Map<String, Object> upd = new HashMap<>();
                            upd.put("id", sportId);
                            upd.put("lthr", newLthr);
                            updateAthleteSportSettings(username, upd);
                            log.info("Updated LTHR to {} for sport {} (id: {})", newLthr, sportType, sportId);
                            return;
                        }
                    }
                }
            }
            log.warn("No sport setting found for type: {}", sportType);
        } catch (Exception e) {
            log.error("Failed to update LTHR for sport {}: {}", sportType, e.getMessage());
            throw new RuntimeException("Failed to update LTHR: " + e.getMessage());
        }
    }

    public List<String> getAvailableActivityTypes() {
        if (cachedActivityTypes != null && (System.currentTimeMillis() - activityTypesCacheTime) < CACHE_DURATION_MS) {
            return cachedActivityTypes;
        }
        try {
            WebClient specClient = WebClient.builder().baseUrl(intervalsBaseUrl).build();
            String specJson = specClient.get().uri("/api/v1/docs")
                    .retrieve().bodyToMono(String.class).block();
            JsonNode spec = objectMapper.readTree(specJson);
            JsonNode categoryEnum = spec.path("components").path("schemas")
                    .path("CategorySummary").path("properties").path("category").path("enum");
            if (categoryEnum.isArray() && categoryEnum.size() > 0) {
                List<String> types = new ArrayList<>();
                for (JsonNode t : categoryEnum) types.add(t.asText());
                cachedActivityTypes = types;
                activityTypesCacheTime = System.currentTimeMillis();
                log.info("Fetched {} activity types from Intervals.icu OpenAPI spec", types.size());
                return types;
            }
            log.warn("Could not find activity type enum in Intervals.icu OpenAPI spec");
            return List.of();
        } catch (Exception e) {
            log.error("Failed to fetch activity types from Intervals.icu OpenAPI spec: {}", e.getMessage());
            return List.of();
        }
    }
}
