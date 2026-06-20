package com.sgen.service;

import com.sgen.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class IntervalsClientFactory {

    @Value("${intervals.api.base-url}")
    private String intervalsBaseUrl;

    private final ConcurrentHashMap<String, WebClient> clientCache = new ConcurrentHashMap<>();

    public WebClient forApiKey(String apiKey) {
        return clientCache.computeIfAbsent(apiKey, key -> {
            String credentials = "API_KEY:" + key;
            String encoded = Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
            
            // Configure HttpClient with 120s response timeout for large data fetches
            HttpClient httpClient = HttpClient.create()
                    .responseTimeout(Duration.ofSeconds(120));
            
            return WebClient.builder()
                    .baseUrl(intervalsBaseUrl)
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Basic " + encoded)
                    .codecs(c -> c.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                    .clientConnector(new ReactorClientHttpConnector(httpClient))
                    .build();
        });
    }

    public static final class ApiContext {
        public final User user;
        public final WebClient client;

        public ApiContext(User user, WebClient client) {
            this.user = user;
            this.client = client;
        }
    }

    public void evict(String apiKey) {
        if (apiKey != null) clientCache.remove(apiKey);
    }

    public ApiContext buildContext(UserService userService, String username) {
        User user = userService.getUserEntityByUsername(username);
        if (user.getIntervalsApiKey() == null || user.getIntervalsAthleteId() == null) {
            throw new RuntimeException("Intervals.icu credentials not configured");
        }
        return new ApiContext(user, forApiKey(user.getIntervalsApiKey()));
    }
}
