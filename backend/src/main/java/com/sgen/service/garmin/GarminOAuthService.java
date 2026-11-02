package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.GarminConnection;
import com.sgen.repository.GarminConnectionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * OAuth 2.0 PKCE flow per Garmin OAuth2PKCE spec:
 * authorize -> oauth2Confirm, token -> diauth.garmin.com (Basic auth),
 * user id + permissions via partner-gateway. Tokens encrypted at rest.
 * Access token 24h (expires_in), refresh ~90d, rotates each refresh.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminOAuthService {

    private final GarminConnectionRepository connectionRepository;
    private final GarminCryptoService cryptoService;
    private final ObjectMapper objectMapper;
    private final com.sgen.service.AppSettingsService appSettingsService;

    @Value("${garmin.client-id:}")
    private String clientId;
    @Value("${garmin.client-secret:}")
    private String clientSecret;
    @Value("${garmin.redirect-uri:}")
    private String redirectUri;
    @Value("${garmin.authorize-url:https://connect.garmin.com/oauth2Confirm}")
    private String authorizeUrl;
    @Value("${garmin.token-url:https://diauth.garmin.com/di-oauth2-service/oauth/token}")
    private String tokenUrl;
    @Value("${garmin.api-base-url:https://apis.garmin.com}")
    private String apiBaseUrl;

    /** state -> pending PKCE request (in-memory, single instance) */
    private final Map<String, PkceRequest> pending = new ConcurrentHashMap<>();
    private static final long PKCE_TTL_MS = 10 * 60 * 1000;

    private record PkceRequest(Long userId, String verifier, long expiresAt) {}

    private String effectiveClientId() {
        String db = appSettingsService.getGarminClientId();
        return (db != null && !db.isBlank()) ? db : clientId;
    }

    private String effectiveClientSecret() {
        String db = appSettingsService.getGarminClientSecret();
        return (db != null && !db.isBlank()) ? db : clientSecret;
    }

    public boolean isConfigured() {
        String id = effectiveClientId(), sec = effectiveClientSecret();
        return id != null && !id.isBlank() && sec != null && !sec.isBlank();
    }

    public String buildAuthorizeUrl(Long userId) {
        byte[] v = new byte[48];
        new SecureRandom().nextBytes(v);
        String verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(v);
        String challenge;
        try {
            challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("PKCE challenge failed", e);
        }
        String state = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(String.valueOf(new SecureRandom().nextLong()).getBytes(StandardCharsets.UTF_8));
        pending.put(state, new PkceRequest(userId, verifier, System.currentTimeMillis() + PKCE_TTL_MS));

        return UriComponentsBuilder.fromUriString(authorizeUrl)
                .queryParam("response_type", "code")
                .queryParam("client_id", effectiveClientId())
                .queryParam("code_challenge", challenge)
                .queryParam("code_challenge_method", "S256")
                .queryParam("redirect_uri", redirectUri)
                .queryParam("state", state)
                .build().toUriString();
    }

    /** Called by /api/garmin/callback. Returns null on success, error message otherwise. */
    public String exchangeCode(String code, String state) {
        PkceRequest req = pending.remove(state);
        if (req == null || req.expiresAt < System.currentTimeMillis()) {
            return "invalid_state";
        }
        try {
            String basic = Base64.getEncoder().encodeToString(
                    (effectiveClientId() + ":" + effectiveClientSecret()).getBytes(StandardCharsets.UTF_8));
            String json = WebClient.builder().build().post()
                    .uri(tokenUrl)
                    .header(HttpHeaders.AUTHORIZATION, "Basic " + basic)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(BodyInserters.fromFormData("grant_type", "authorization_code")
                            .with("code", code)
                            .with("code_verifier", req.verifier())
                            .with("redirect_uri", redirectUri))
                    .retrieve().bodyToMono(String.class).block();
            JsonNode tokens = objectMapper.readTree(json);
            saveTokens(req.userId(), tokens);

            GarminConnection conn = connectionRepository.findByUserId(req.userId()).orElseThrow();
            fetchAndStoreUserIdAndPermissions(conn);
            return null;
        } catch (Exception e) {
            log.error("Garmin token exchange failed: {}", e.getMessage());
            return "exchange_failed";
        }
    }

    private void saveTokens(Long userId, JsonNode tokens) {
        GarminConnection conn = connectionRepository.findByUserId(userId)
                .orElseGet(() -> GarminConnection.builder().userId(userId).build());
        conn.setAccessToken(cryptoService.encrypt(tokens.path("access_token").asText()));
        conn.setRefreshToken(cryptoService.encrypt(tokens.path("refresh_token").asText()));
        conn.setTokenExpiresAt(LocalDateTime.now().plusSeconds(tokens.path("expires_in").asLong(86400)));
        long refreshSecs = tokens.path("refresh_token_expires_in").asLong(0);
        conn.setRefreshExpiresAt(refreshSecs > 0 ? LocalDateTime.now().plusSeconds(refreshSecs) : null);
        conn.setScopes(tokens.path("scope").asText(null));
        conn.setStatus("ACTIVE");
        connectionRepository.save(conn);
    }

    private void fetchAndStoreUserIdAndPermissions(GarminConnection conn) {
        try {
            String accessToken = cryptoService.decrypt(conn.getAccessToken());
            WebClient client = WebClient.builder().baseUrl(apiBaseUrl)
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken).build();
            String idJson = client.get().uri("/partner-gateway/rest/user/id")
                    .retrieve().bodyToMono(String.class).block();
            String garminUserId = objectMapper.readTree(idJson).path("userId").asText(null);
            conn.setGarminUserId(garminUserId);
            try {
                String permJson = client.get().uri("/partner-gateway/rest/user/permissions")
                        .retrieve().bodyToMono(String.class).block();
                conn.setScopes(permJson);
            } catch (Exception e) {
                log.warn("Could not fetch Garmin permissions: {}", e.getMessage());
            }
            connectionRepository.save(conn);
        } catch (Exception e) {
            log.error("Could not fetch Garmin userId: {}", e.getMessage());
        }
    }

    /** Returns a valid access token, refreshing if <600s remain (per spec). */
    public String getValidAccessToken(Long userId) {
        Optional<GarminConnection> opt = connectionRepository.findByUserId(userId);
        if (opt.isEmpty()) return null;
        GarminConnection conn = opt.get();
        if (conn.getTokenExpiresAt() == null
                || conn.getTokenExpiresAt().isBefore(LocalDateTime.now().plusSeconds(600))) {
            refresh(conn);
        }
        return cryptoService.decrypt(conn.getAccessToken());
    }

    public synchronized void refresh(GarminConnection conn) {
        try {
            String refreshToken = cryptoService.decrypt(conn.getRefreshToken());
            if (refreshToken == null) throw new IllegalStateException("No refresh token");
            String basic = Base64.getEncoder().encodeToString(
                    (effectiveClientId() + ":" + effectiveClientSecret()).getBytes(StandardCharsets.UTF_8));
            String json = WebClient.builder().build().post()
                    .uri(tokenUrl)
                    .header(HttpHeaders.AUTHORIZATION, "Basic " + basic)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(BodyInserters.fromFormData("grant_type", "refresh_token")
                            .with("refresh_token", refreshToken))
                    .retrieve().bodyToMono(String.class).block();
            JsonNode tokens = objectMapper.readTree(json);
            conn.setAccessToken(cryptoService.encrypt(tokens.path("access_token").asText()));
            String newRefresh = tokens.path("refresh_token").asText(null);
            if (newRefresh != null) conn.setRefreshToken(cryptoService.encrypt(newRefresh));
            conn.setTokenExpiresAt(LocalDateTime.now().plusSeconds(tokens.path("expires_in").asLong(86400)));
            long refreshSecs = tokens.path("refresh_token_expires_in").asLong(0);
            if (refreshSecs > 0) conn.setRefreshExpiresAt(LocalDateTime.now().plusSeconds(refreshSecs));
            conn.setStatus("ACTIVE");
            connectionRepository.save(conn);
        } catch (Exception e) {
            log.error("Garmin token refresh failed for user {}: {}", conn.getUserId(), e.getMessage());
            conn.setStatus("NEEDS_REAUTH");
            connectionRepository.save(conn);
        }
    }

    /** User disconnects inside SGEN: revoke at Garmin + drop local data. */
    public void disconnect(Long userId) {
        Optional<GarminConnection> opt = connectionRepository.findByUserId(userId);
        if (opt.isEmpty()) return;
        GarminConnection conn = opt.get();
        try {
            String accessToken = cryptoService.decrypt(conn.getAccessToken());
            if (accessToken != null) {
                WebClient.builder().baseUrl(apiBaseUrl).build().delete()
                        .uri("/partner-gateway/rest/user/registration")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                        .retrieve().toBodilessEntity().block();
            }
        } catch (Exception e) {
            log.warn("Garmin remote deregistration failed (continuing local cleanup): {}", e.getMessage());
        }
        connectionRepository.delete(conn);
    }

    /** Garmin-side deregistration push: wipe all local data for that garminUserId. */
    public Long handleDeregistration(String garminUserId) {
        Optional<GarminConnection> opt = connectionRepository.findByGarminUserId(garminUserId);
        if (opt.isEmpty()) return null;
        Long userId = opt.get().getUserId();
        connectionRepository.delete(opt.get());
        return userId;
    }

    /** Periodic refresh of tokens expiring within 12h. */
    public void refreshExpiringTokens() {
        LocalDateTime threshold = LocalDateTime.now().plusHours(12);
        for (GarminConnection conn : connectionRepository.findAll()) {
            if (conn.getTokenExpiresAt() != null && conn.getTokenExpiresAt().isBefore(threshold)
                    && "ACTIVE".equals(conn.getStatus())) {
                refresh(conn);
            }
        }
    }

    public List<GarminConnection> findAll() {
        return connectionRepository.findAll();
    }
}
