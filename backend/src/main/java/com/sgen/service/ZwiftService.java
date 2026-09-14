package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Talks to the unofficial Zwift API (same endpoints as the Zwift Companion
 * app / zwift.com). FTP updates are pushed via
 * PUT https://www.zwift.com/api/profiles/me/{id} — the same call the zwift.com
 * profile editor makes — with the full JSON profile as body. Note that the
 * protobuf endpoints on the game host (PUT /api/profiles/{id} and
 * /in-game-fields) return 2xx but silently discard profile fields, so a
 * read-back verification is required.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ZwiftService {

    private static final String AUTH_URL = "https://secure.zwift.com/auth/realms/zwift/tokens/access/codes";
    private static final String BASE_URL = "https://us-or-rly101.zwift.com";
    private static final String WEB_URL = "https://www.zwift.com";
    private static final String CLIENT_ID = "Zwift_Mobile_Link";
    private static final String USER_AGENT = "Zwift/115 CFNetwork/758.0.2 Darwin/15.0.0";

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15)).build();

    // Authenticated tokens per app username
    private final Map<String, ZwiftToken> tokens = new ConcurrentHashMap<>();

    private static class ZwiftToken {
        String accessToken;
        String refreshToken;
        long expiresAt;
    }

    /**
     * Verify credentials against Zwift and return basic profile info.
     * Throws on failure.
     */
    public Map<String, Object> testConnection(String zwiftUsername, String zwiftPassword) throws Exception {
        ZwiftToken token = authenticate(zwiftUsername, zwiftPassword);
        JsonNode profile = fetchProfile(token.accessToken);
        return Map.of(
                "success", true,
                "playerId", profile.path("id").asLong(),
                "name", (profile.path("firstName").asText("") + " " + profile.path("lastName").asText("")).trim(),
                "ftp", profile.path("ftp").asInt(0));
    }

    /**
     * Push the user's profile values to Zwift when the integration is enabled
     * and credentials are configured. Mirrors weight and height from the
     * intervals.icu athlete profile; {@code ftp} may be null to leave the
     * Zwift FTP unchanged. Never throws.
     */
    public void syncProfile(String username, Integer ftp) {
        try {
            User user = userService.getUserEntityByUsername(username);
            if (!Boolean.TRUE.equals(user.getZwiftEnabled())
                    || user.getZwiftUsername() == null || user.getZwiftPassword() == null) {
                return;
            }
            ZwiftToken token = ensureToken(user);
            JsonNode profile = fetchProfile(token.accessToken);
            long playerId = profile.path("id").asLong();
            if (user.getZwiftPlayerId() == null || user.getZwiftPlayerId() != playerId) {
                user.setZwiftPlayerId(playerId);
                userService.saveUser(user);
            }

            // Mirror height/weight from intervals.icu athlete profile
            Integer weightGrams = null;
            Integer heightMm = null;
            try {
                JsonNode athlete = fetchIntervalsAthlete(username);
                if (athlete != null) {
                    double weightKg = athlete.path("icu_weight").asDouble(0);
                    if (weightKg <= 0) weightKg = athlete.path("weight").asDouble(0);
                    if (weightKg > 0) weightGrams = (int) Math.round(weightKg * 1000);
                    double height = athlete.path("height").asDouble(0);
                    if (height > 0) heightMm = (int) Math.round(height < 3 ? height * 1000 : height * 10);
                }
            } catch (Exception e) {
                log.warn("Could not fetch intervals.icu athlete data for {}, pushing FTP only: {}",
                        username, e.getMessage());
            }

            boolean ftpMatch = ftp == null || profile.path("ftp").asInt(0) == ftp;
            boolean weightMatch = weightGrams == null || profile.path("weight").asInt(0) == weightGrams;
            boolean heightMatch = heightMm == null || profile.path("height").asInt(0) == heightMm;
            if (ftpMatch && weightMatch && heightMatch) {
                log.info("Zwift profile {} already in sync for user {}", playerId, username);
                return;
            }
            ObjectNode body = profile.deepCopy();
            if (ftp != null) body.put("ftp", ftp);
            if (weightGrams != null) body.put("weight", weightGrams);
            if (heightMm != null) body.put("height", heightMm);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(WEB_URL + "/api/profiles/me/" + playerId))
                    .header("Authorization", "Bearer " + token.accessToken)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("Source", "zwift-web")
                    .header("Cache-Control", "no-cache")
                    .timeout(Duration.ofSeconds(15))
                    .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("Zwift profile update failed with status {} for user {}", response.statusCode(), username);
                return;
            }
            JsonNode readBack = fetchProfile(token.accessToken);
            boolean ftpOk = ftp == null || readBack.path("ftp").asInt(0) == ftp;
            boolean weightOk = weightGrams == null || readBack.path("weight").asInt(0) == weightGrams;
            boolean heightOk = heightMm == null || readBack.path("height").asInt(0) == heightMm;
            if (ftpOk && weightOk && heightOk) {
                log.info("Pushed profile{}{} to Zwift profile {} for user {}",
                        ftp != null ? " (FTP " + ftp + " W)" : "",
                        describeExtras(weightGrams, heightMm), playerId, username);
            } else {
                log.warn("Zwift update accepted but read-back differs (ftp={}, weight={}, height={}) for user {}",
                        readBack.path("ftp").asInt(0), readBack.path("weight").asInt(0),
                        readBack.path("height").asInt(0), username);
            }
        } catch (Exception e) {
            log.warn("Failed to push FTP to Zwift for {}: {}", username, e.getMessage());
        }
    }

    private String describeExtras(Integer weightGrams, Integer heightMm) {
        StringBuilder sb = new StringBuilder();
        if (weightGrams != null) sb.append(", weight ").append(weightGrams / 1000.0).append(" kg");
        if (heightMm != null) sb.append(", height ").append(heightMm / 10.0).append(" cm");
        return sb.toString();
    }

    private JsonNode fetchIntervalsAthlete(String username) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        String json = ctx.client.get()
                .uri("/api/v1/athlete/{id}", ctx.user.getIntervalsAthleteId())
                .retrieve().bodyToMono(String.class).block();
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private ZwiftToken ensureToken(User user) throws Exception {
        ZwiftToken cached = tokens.get(user.getUsername());
        if (cached != null && System.currentTimeMillis() < cached.expiresAt) {
            return cached;
        }
        if (cached != null && cached.refreshToken != null) {
            try {
                ZwiftToken refreshed = tokenRequest(
                        "grant_type=refresh_token&refresh_token=" +
                                URLEncoder.encode(cached.refreshToken, StandardCharsets.UTF_8));
                tokens.put(user.getUsername(), refreshed);
                return refreshed;
            } catch (Exception e) {
                log.debug("Zwift token refresh failed for {}, re-authenticating", user.getUsername());
            }
        }
        ZwiftToken token = authenticate(user.getZwiftUsername(), user.getZwiftPassword());
        tokens.put(user.getUsername(), token);
        return token;
    }

    private ZwiftToken authenticate(String username, String password) throws Exception {
        return tokenRequest(
                "grant_type=password&username=" + URLEncoder.encode(username, StandardCharsets.UTF_8) +
                        "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8));
    }

    private ZwiftToken tokenRequest(String grantParams) throws Exception {
        String body = "client_id=" + CLIENT_ID + "&" + grantParams;
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(AUTH_URL))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(15))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new RuntimeException("Zwift authentication failed: " + response.statusCode());
        }
        JsonNode json = objectMapper.readTree(response.body());
        ZwiftToken token = new ZwiftToken();
        token.accessToken = json.path("access_token").asText();
        token.refreshToken = json.path("refresh_token").asText(null);
        // Refresh 60 seconds before actual expiry
        token.expiresAt = System.currentTimeMillis() + (json.path("expires_in").asLong(3600) - 60) * 1000;
        return token;
    }

    private JsonNode fetchProfile(String accessToken) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/api/profiles/me"))
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "application/json")
                .header("User-Agent", USER_AGENT)
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new RuntimeException("Zwift profile fetch failed: " + response.statusCode());
        }
        return objectMapper.readTree(response.body());
    }
}
