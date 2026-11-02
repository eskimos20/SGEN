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

    private final ConcurrentHashMap<String, WebClient> clientCache = new ConcurrentHashMap<>();

    private WebClient forToken(String accessToken) {
        return clientCache.computeIfAbsent(accessToken, token -> {
            HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(60));
            return WebClient.builder()
                    .baseUrl(apiBaseUrl)
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .codecs(c -> c.defaultCodecs().maxInMemorySize(20 * 1024 * 1024))
                    .clientConnector(new ReactorClientHttpConnector(httpClient))
                    .build();
        });
    }

    /** WebClient for a connected user, or null if not connected. */
    public WebClient clientForUser(Long userId) {
        if (!connectionRepository.findByUserId(userId).isPresent()) return null;
        String token = oauthService.getValidAccessToken(userId);
        return token == null ? null : forToken(token);
    }

    /** Whether a user has an ACTIVE garmin connection. */
    public boolean isConnected(Long userId) {
        return connectionRepository.findByUserId(userId)
                .map(c -> "ACTIVE".equals(c.getStatus())).orElse(false);
    }
}
