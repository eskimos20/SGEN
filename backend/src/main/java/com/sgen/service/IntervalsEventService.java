package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsEventService {

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;

    public JsonNode fetchCalendarEvents(String username, String oldest, String newest) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = ctx.client.get()
                    .uri("/api/v1/athlete/{athleteId}/events?oldest={oldest}&newest={newest}",
                            ctx.user.getIntervalsAthleteId(), oldest, newest)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch calendar events: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to fetch calendar events: " + e.getMessage());
        }
    }

    public JsonNode fetchCalendarActivities(String username, String oldest, String newest) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        // Garmin-connected: refresh the mirror from Intervals, then serve it —
        // protected sources survive even if the API starts filtering them.
        if (garminClientFactory.isConnected(ctx.user.getId())) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            try {
                String json = ctx.client.get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/api/v1/athlete/{id}/activities")
                                .queryParam("oldest", oldest)
                                .queryParam("newest", newest)
                                .build(ctx.user.getIntervalsAthleteId()))
                        .retrieve().bodyToMono(String.class).block();
                JsonNode fetched = objectMapper.readTree(json);
                if (fetched != null && fetched.isArray()) {
                    var keepIds = new java.util.HashSet<String>();
                    for (JsonNode a : fetched) {
                        intervalsMirrorService.saveActivity(ctx.user.getId(), a);
                        keepIds.add(a.path("id").asText());
                    }
                    intervalsMirrorService.pruneActivities(ctx.user.getId(), from, to, keepIds);
                }
            } catch (Exception e) {
                log.debug("Calendar activities mirror refresh failed: {}", e.getMessage());
            }
            var rows = intervalsActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(ctx.user.getId(), from, to);
            var arr = objectMapper.createArrayNode();
            for (var r : rows) {
                try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                catch (Exception e) { log.debug("mirror parse {}", e.getMessage()); }
            }
            return arr;
        }
        try {
            String json = ctx.client.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()))
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch calendar activities: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch calendar activities: " + e.getMessage());
        }
    }

    public JsonNode fetchEvent(String username, int eventId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = ctx.client.get()
                    .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                            ctx.user.getIntervalsAthleteId(), eventId)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch event {}: {}", eventId, e.getMessage());
            throw new RuntimeException("Failed to fetch event: " + e.getMessage());
        }
    }

    public JsonNode updateEvent(String username, int eventId, Map<String, Object> updates) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = ctx.client.put()
                    .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                            ctx.user.getIntervalsAthleteId(), eventId)
                    .bodyValue(updates)
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to update event {}: {}", eventId, e.getMessage());
            throw new RuntimeException("Failed to update event: " + e.getMessage());
        }
    }

    public void deleteEvent(String username, int eventId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            ctx.client.delete()
                    .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                            ctx.user.getIntervalsAthleteId(), eventId)
                    .retrieve().bodyToMono(Void.class).block();
        } catch (Exception e) {
            log.error("Failed to delete event {}: {}", eventId, e.getMessage());
            throw new RuntimeException("Failed to delete event: " + e.getMessage());
        }
    }

    public JsonNode createEvent(String username, Map<String, Object> eventData) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            List<Map<String, Object>> events = List.of(eventData);
            String json = ctx.client.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{athleteId}/events/bulk")
                            .queryParam("upsert", "true")
                            .build(ctx.user.getIntervalsAthleteId()))
                    .bodyValue(events)
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                            response -> response.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("API error " + response.statusCode() + ": " + body)))
                    .bodyToMono(String.class).block();
            JsonNode result = objectMapper.readTree(json);
            if (result.isArray() && result.size() > 0) return result.get(0);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Failed to create event: " + e.getMessage());
        }
    }
}
