package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.util.IntervalsApiRateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriBuilder;

import java.net.URI;
import java.util.function.Function;

/**
 * Shared rate-limited Intervals.icu GET helper — every service makes the same
 * acquire → GET → block → parse sequence; this keeps it in one place so the
 * rate limiter and JSON handling stay consistent.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsApiClient {

    private final IntervalsApiRateLimiter rateLimiter;
    private final ObjectMapper objectMapper;

    /** GET with URI template + vars, parsed to JsonNode. */
    public JsonNode getJson(WebClient client, String path, Object... uriVars) throws Exception {
        return readJson(getString(client, path, uriVars));
    }

    /** GET with URI builder function, parsed to JsonNode. */
    public JsonNode getJson(WebClient client, Function<UriBuilder, URI> uriFn) throws Exception {
        return readJson(getString(client, uriFn));
    }

    /** GET with URI template + vars, raw response body. */
    public String getString(WebClient client, String path, Object... uriVars) {
        rateLimiter.acquire();
        return client.get().uri(path, uriVars)
                .retrieve().bodyToMono(String.class).block();
    }

    /** GET with URI builder function, raw response body. */
    public String getString(WebClient client, Function<UriBuilder, URI> uriFn) {
        rateLimiter.acquire();
        return client.get().uri(uriFn::apply)
                .retrieve().bodyToMono(String.class).block();
    }

    /** GET with URI template + vars, binary response body (map/chart PNGs). */
    public byte[] getBytes(WebClient client, String path, Object... uriVars) {
        rateLimiter.acquire();
        return client.get().uri(path, uriVars)
                .retrieve().bodyToMono(byte[].class).block();
    }

    private JsonNode readJson(String body) throws Exception {
        return objectMapper.readTree(body);
    }
}
