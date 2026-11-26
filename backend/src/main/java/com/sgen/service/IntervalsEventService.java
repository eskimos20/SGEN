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

    private final com.sgen.service.IntervalsApiClient intervalsApi;
    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.service.garmin.IntervalsMirrorService intervalsMirrorService;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsEventRepository intervalsEventRepository;
    private final com.sgen.service.garmin.GarminMergeService garminMergeService;

    public JsonNode fetchCalendarEvents(String username, String oldest, String newest) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        // Garmin-connected: the local DB is master — Intervals is a write
        // destination only, never a read source. No refresh, no pruning.
        if (garminClientFactory.isConnected(ctx.user.getId())) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            var rows = intervalsEventRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(ctx.user.getId(), from, to);
            var arr = objectMapper.createArrayNode();
            for (var r : rows) {
                try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                catch (Exception e) { log.debug("mirror event parse {}", e.getMessage()); }
            }
            return arr;
        }
        try {
            String json = intervalsApi.getString(ctx.client, "/api/v1/athlete/{athleteId}/events?oldest={oldest}&newest={newest}",
                            ctx.user.getIntervalsAthleteId(), oldest, newest);
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
                String json = intervalsApi.getString(ctx.client, uriBuilder -> uriBuilder
                                .path("/api/v1/athlete/{id}/activities")
                                .queryParam("oldest", oldest)
                                .queryParam("newest", newest)
                                .build(ctx.user.getIntervalsAthleteId()));
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
            // Same merge as statistics — local Garmin activities (with locally
            // computed load) take precedence over their Intervals copies.
            garminMergeService.mergeActivities(ctx.user.getId(), arr);
            return arr;
        }
        try {
            String json = intervalsApi.getString(ctx.client, uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest)
                            .queryParam("newest", newest)
                            .build(ctx.user.getIntervalsAthleteId()));
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch calendar activities: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch calendar activities: " + e.getMessage());
        }
    }

    public JsonNode fetchEvent(String username, int eventId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        // Local-master events (negative ids) live only in our DB.
        if (eventId < 0 || garminClientFactory.isConnected(ctx.user.getId())) {
            var row = intervalsEventRepository
                    .findByUserIdAndEventId(ctx.user.getId(), String.valueOf(eventId)).orElse(null);
            if (row == null) return null;
            try { return objectMapper.readTree(row.getPayloadJson()); }
            catch (Exception e) { return null; }
        }
        try {
            String json = intervalsApi.getString(ctx.client, "/api/v1/athlete/{athleteId}/events/{eventId}",
                            ctx.user.getIntervalsAthleteId(), eventId);
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch event {}: {}", eventId, e.getMessage());
            throw new RuntimeException("Failed to fetch event: " + e.getMessage());
        }
    }

    public JsonNode updateEvent(String username, int eventId, Map<String, Object> updates) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        boolean localMaster = garminClientFactory.isConnected(ctx.user.getId());
        if (localMaster) {
            // Local DB is master: apply the update locally first, then push
            // to Intervals best-effort. Positive ids are themselves the
            // upstream id; local events carry theirs in sgen_intervals_id.
            JsonNode merged = mergeEventIntoMirror(ctx.user.getId(), eventId, updates);
            if (merged == null) {
                throw new RuntimeException("Event not found: " + eventId);
            }
            Long upstreamId = upstreamIdFor(merged, eventId);
            if (upstreamId == null) {
                // Never reached Intervals — try creating it there now.
                pushEventToIntervals(ctx, (com.fasterxml.jackson.databind.node.ObjectNode) merged);
                return merged;
            }
            try {
                String json = ctx.client.put()
                        .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                                ctx.user.getIntervalsAthleteId(), upstreamId)
                        .bodyValue(updates)
                        .retrieve().bodyToMono(String.class).block();
                JsonNode updated = objectMapper.readTree(json);
                if (updated != null && eventId > 0) {
                    intervalsMirrorService.saveEvents(ctx.user.getId(),
                            updated.isArray() ? updated : objectMapper.createArrayNode().add(updated));
                }
                return merged;
            } catch (Exception e) {
                log.warn("Intervals update failed for event {} — local master keeps change: {}",
                        eventId, e.getMessage());
                return merged;
            }
        }
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

    @org.springframework.transaction.annotation.Transactional
    public void deleteEvent(String username, int eventId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        boolean localMaster = garminClientFactory.isConnected(ctx.user.getId());
        if (localMaster) {
            // Master: always remove locally; Intervals delete best-effort.
            // Resolve the upstream id before deleting the local row.
            Long upstreamId = null;
            var row = intervalsEventRepository
                    .findByUserIdAndEventId(ctx.user.getId(), String.valueOf(eventId)).orElse(null);
            if (row != null) {
                try {
                    var payload = objectMapper.readTree(row.getPayloadJson());
                    upstreamId = upstreamIdFor(payload, eventId);
                } catch (Exception ignored) {}
            }
            intervalsEventRepository.deleteByUserIdAndEventId(
                    ctx.user.getId(), String.valueOf(eventId));
            if (upstreamId == null) return; // never existed upstream
            try {
                ctx.client.delete()
                        .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                                ctx.user.getIntervalsAthleteId(), upstreamId)
                        .retrieve().bodyToMono(Void.class).block();
            } catch (Exception e) {
                log.warn("Intervals delete failed for event {} — already removed locally: {}",
                        eventId, e.getMessage());
            }
            return;
        }
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
        if (garminClientFactory.isConnected(ctx.user.getId())) {
            // Local DB is master: always write the event locally first with a
            // negative id (compatible with calendar_events and
            // garmin_workout_pushes int columns), then push to Intervals
            // best-effort and remember the upstream id for update/delete.
            var ev = (com.fasterxml.jackson.databind.node.ObjectNode)
                    objectMapper.valueToTree(eventData);
            ev.put("id", nextLocalEventId(ctx.user.getId()));
            ev.put("sgen_local", true);
            intervalsMirrorService.saveEvents(ctx.user.getId(),
                    objectMapper.createArrayNode().add(ev));
            pushEventToIntervals(ctx, ev);
            return ev;
        }
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

    /**
     * Best-effort POST of a local-master event to Intervals. On success the
     * upstream id is stored as sgen_intervals_id inside the payload so
     * update/delete can address the Intervals copy later.
     */
    private void pushEventToIntervals(ApiContext ctx,
                                      com.fasterxml.jackson.databind.node.ObjectNode ev) {
        try {
            var outbound = ev.deepCopy();
            outbound.remove("id");
            outbound.remove("sgen_local");
            outbound.remove("sgen_intervals_id");
            String json = ctx.client.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v1/athlete/{athleteId}/events/bulk")
                            .queryParam("upsert", "true")
                            .build(ctx.user.getIntervalsAthleteId()))
                    .bodyValue(List.of(objectMapper.convertValue(outbound, Map.class)))
                    .retrieve().bodyToMono(String.class).block();
            JsonNode result = objectMapper.readTree(json);
            JsonNode first = result.isArray() && result.size() > 0 ? result.get(0) : result;
            if (first != null && first.hasNonNull("id")) {
                ev.put("sgen_intervals_id", first.get("id").asLong());
                intervalsMirrorService.saveEvents(ctx.user.getId(),
                        objectMapper.createArrayNode().add(ev));
            }
        } catch (Exception e) {
            log.warn("Intervals push failed for local event {} — stays local-only: {}",
                    ev.path("id").asText(), e.getMessage());
        }
    }

    private int nextLocalEventId(Long userId) {
        int min = 0;
        for (var row : intervalsEventRepository.findByUserId(userId)) {
            try {
                int v = Integer.parseInt(row.getEventId());
                if (v < min) min = v;
            } catch (Exception ignored) {}
        }
        return min - 1;
    }

    /** Intervals-side id of an event: the id itself for upstream events,
     *  sgen_intervals_id from the payload for local-master events. */
    private Long upstreamIdFor(JsonNode payload, int eventId) {
        if (eventId > 0) return (long) eventId;
        var n = payload.path("sgen_intervals_id");
        return n.isNumber() ? n.asLong() : null;
    }

    /** Merge update fields into the stored mirror event; returns merged node or null. */
    private JsonNode mergeEventIntoMirror(Long userId, int eventId, Map<String, Object> updates) {
        var row = intervalsEventRepository.findByUserIdAndEventId(userId, String.valueOf(eventId)).orElse(null);
        if (row == null) return null;
        try {
            var node = (com.fasterxml.jackson.databind.node.ObjectNode) objectMapper.readTree(row.getPayloadJson());
            node.setAll((com.fasterxml.jackson.databind.node.ObjectNode) objectMapper.valueToTree(updates));
            intervalsMirrorService.saveEvents(userId, objectMapper.createArrayNode().add(node));
            return node;
        } catch (Exception e) {
            log.debug("Local event merge for {} failed: {}", eventId, e.getMessage());
            return null;
        }
    }
}
