package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsWellnessService {

    private final com.sgen.service.IntervalsApiClient intervalsApi;
    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;
    private final IntervalsService intervalsService;
    private final IntervalsStatsService statsService;
    private final com.sgen.util.IntervalsApiRateLimiter rateLimiter;

    public List<Map<String, Object>> fetchWellnessData(String username, String oldest, String newest) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = intervalsApi.getString(ctx.client, uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/wellness")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()));
            JsonNode node = objectMapper.readTree(json);
            List<Map<String, Object>> list = new ArrayList<>();
            if (node.isArray()) {
                for (JsonNode entry : node) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> row = objectMapper.convertValue(entry, Map.class);
                    list.add(row);
                }
            }
            return list;
        } catch (Exception e) {
            log.error("Failed to fetch wellness data from Intervals.icu: {}", e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    public JsonNode updateWellnessData(String username, List<Map<String, Object>> updates) {
        var user = userService.getUserEntityByUsername(username);
        boolean garminConnected = garminClientFactory.isConnected(user.getId());
        ApiContext ctx = null;
        try { ctx = clientFactory.buildContext(userService, username); } catch (Exception ignored) {}
        if (ctx == null) {
            // No Intervals creds: Garmin-connected users can still edit —
            // the mirror is the wellness master for them anyway.
            if (!garminConnected) {
                throw new RuntimeException("Intervals.icu is not configured");
            }
            for (Map<String, Object> update : updates) {
                intervalsMirrorService.mergeWellnessUpdate(user.getId(), update);
            }
            return objectMapper.valueToTree(updates);
        }
        try {
            rateLimiter.acquire();
            String json = ctx.client.put()
                    .uri("/api/v1/athlete/{id}/wellness-bulk", ctx.user.getIntervalsAthleteId())
                    .bodyValue(updates)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode response = objectMapper.readTree(json);
            // Garmin-connected: mirror the manual edits locally too.
            if (garminClientFactory.isConnected(ctx.user.getId())) {
                for (Map<String, Object> update : updates) {
                    intervalsMirrorService.mergeWellnessUpdate(ctx.user.getId(), update);
                }
            }
            return response;
        } catch (Exception e) {
            log.error("Failed to update wellness data: {}", e.getMessage());
            throw new RuntimeException("Failed to update wellness data: " + e.getMessage());
        }
    }

    public JsonNode fetchHrCurves(String username, String oldest, String newest) {
        Long uid = userService.getUserEntityByUsername(username).getId();
        // Garmin-connected: compute from local streams — no API call.
        if (garminClientFactory.isConnected(uid)) {
            JsonNode local = statsService.localCurveHistory(
                    uid, username, oldest, newest, "all", "heartrate");
            var wrapper = objectMapper.createObjectNode();
            wrapper.set("hrCurves", local);
            return wrapper;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = intervalsApi.getString(ctx.client, uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/hr-curves")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()));
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch HR curves: {}", e.getMessage());
            return null;
        }
    }
}
