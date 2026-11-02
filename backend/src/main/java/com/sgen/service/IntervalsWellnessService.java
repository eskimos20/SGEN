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

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;
    private final IntervalsService intervalsService;

    public List<Map<String, Object>> fetchWellnessData(String username, String oldest, String newest) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = ctx.client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/wellness")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()))
                    .retrieve().bodyToMono(String.class).block();
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        // Garmin-connected: compute from mirrored heartrate streams — no API call.
        if (garminClientFactory.isConnected(ctx.user.getId())
                && intervalsMirrorService.hasActivities(ctx.user.getId())) {
            JsonNode local = intervalsService.localCurveHistory(
                    ctx.user.getId(), username, oldest, newest, "all", "heartrate");
            var wrapper = objectMapper.createObjectNode();
            wrapper.set("hrCurves", local);
            return wrapper;
        }
        try {
            String json = ctx.client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/hr-curves")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()))
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch HR curves: {}", e.getMessage());
            return null;
        }
    }
}
