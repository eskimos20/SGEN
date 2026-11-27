package com.sgen.service.garmin;

import com.sgen.repository.GarminConnectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebClient factory for Garmin API calls (apis.garmin.com).
 * Resolves a fresh Bearer token per user (auto-refresh via OAuthService),
 * mirrors IntervalsClientFactory's caching pattern keyed by token value.
 */
@Component
@RequiredArgsConstructor
public class GarminClientFactory {

    private final GarminConnectionRepository connectionRepository;
    private final GarminOAuthService oauthService;

    @Value("${garmin.api-base-url:https://apis.garmin.com}")
    private String apiBaseUrl;

    // Keyed by userId (not token): OAuth refresh rotates the token ~daily
    // and a token-keyed cache would grow unboundedly.
    private final ConcurrentHashMap<Long, CachedClient> clientCache = new ConcurrentHashMap<>();

    private record CachedClient(String token, WebClient client) {}

    private WebClient forToken(Long userId, String accessToken) {
        CachedClient cached = clientCache.get(userId);
        if (cached != null && cached.token().equals(accessToken)) return cached.client();
        HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(60));
        WebClient client = WebClient.builder()
                .baseUrl(apiBaseUrl)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(20 * 1024 * 1024))
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
        clientCache.put(userId, new CachedClient(accessToken, client));
        return client;
    }

    /** WebClient for a connected user, or null if not connected. */
    public WebClient clientForUser(Long userId) {
        if (!connectionRepository.findByUserId(userId).isPresent()) {
            clientCache.remove(userId);
            return null;
        }
        String token = oauthService.getValidAccessToken(userId);
        return token == null ? null : forToken(userId, token);
    }

    /** Whether a user has an ACTIVE garmin connection. */
    public boolean isConnected(Long userId) {
        return connectionRepository.findByUserId(userId)
                .map(c -> "ACTIVE".equals(c.getStatus())).orElse(false);
    }
}
