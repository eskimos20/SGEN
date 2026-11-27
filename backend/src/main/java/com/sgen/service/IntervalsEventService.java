package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.User;
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
    private final com.sgen.repository.GarminWorkoutPushRepository garminWorkoutPushRepository;
    private final com.sgen.repository.CalendarEventRepository calendarEventRepository;
    private final com.sgen.service.garmin.GarminMergeService garminMergeService;
    private final com.sgen.util.IntervalsApiRateLimiter rateLimiter;

    public JsonNode fetchCalendarEvents(String username, String oldest, String newest) {
        User user = userService.getUserEntityByUsername(username);
        // Garmin-connected: the local DB is master — Intervals is a write
        // destination only, never a read source. No refresh, no pruning.
        if (garminClientFactory.isConnected(user.getId())) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            var rows = intervalsEventRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(user.getId(), from, to);
            var arr = objectMapper.createArrayNode();
            for (var r : rows) {
                try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                catch (Exception e) { log.debug("mirror event parse {}", e.getMessage()); }
            }
            return arr;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
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
        User user = userService.getUserEntityByUsername(username);
        // Garmin-connected: the local mirror plus local Garmin activities is
        // the only source — activity data is never pulled from Intervals.
        if (garminClientFactory.isConnected(user.getId())) {
            var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
            var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
            var rows = intervalsActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(user.getId(), from, to);
            var arr = objectMapper.createArrayNode();
            for (var r : rows) {
                try { arr.add(objectMapper.readTree(r.getPayloadJson())); }
                catch (Exception e) { log.debug("mirror parse {}", e.getMessage()); }
            }
            // Same merge as statistics — local Garmin activities (with locally
            // computed load) take precedence over their Intervals copies.
            garminMergeService.mergeActivities(user.getId(), arr, from, to);
            return arr;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
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
        User user = userService.getUserEntityByUsername(username);
        // Local-master events (negative ids) live only in our DB.
        if (eventId < 0 || garminClientFactory.isConnected(user.getId())) {
            var row = intervalsEventRepository
                    .findByUserIdAndEventId(user.getId(), String.valueOf(eventId)).orElse(null);
            if (row != null) {
                try { return objectMapper.readTree(row.getPayloadJson()); }
                catch (Exception e) { return null; }
            }
            if (eventId < 0 || !garminClientFactory.isConnected(user.getId())) return null;
            // Positive id not mirrored: an upstream event (e.g. created in the
            // Intervals UI). Fetch just that event — never the activity feed —
            // so detail views/edits still work, and mirror it for next time.
            ApiContext ctx = intervalsCtxOrNull(username);
            if (ctx == null) return null;
            try {
                String json = intervalsApi.getString(ctx.client, "/api/v1/athlete/{athleteId}/events/{eventId}",
                        ctx.user.getIntervalsAthleteId(), eventId);
                JsonNode ev = objectMapper.readTree(json);
                if (ev != null && ev.isObject()) {
                    intervalsMirrorService.saveEvents(user.getId(),
                            objectMapper.createArrayNode().add(ev));
                }
                return ev;
            } catch (Exception e) {
                log.debug("Upstream event {} fetch failed: {}", eventId, e.getMessage());
                return null;
            }
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
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
        User user = userService.getUserEntityByUsername(username);
        boolean localMaster = garminClientFactory.isConnected(user.getId());
        if (localMaster) {
            // Local DB is master: apply the update locally first, then push
            // to Intervals best-effort. Positive ids are themselves the
            // upstream id; local events carry theirs in sgen_intervals_id.
            JsonNode merged = mergeEventIntoMirror(user.getId(), eventId, updates);
            ApiContext ctx = intervalsCtxOrNull(username);
            if (merged == null) {
                // Not mirrored — a positive id may still exist upstream;
                // push the update there and mirror the response.
                if (ctx == null || eventId <= 0) {
                    throw new RuntimeException("Event not found: " + eventId);
                }
                try {
                    rateLimiter.acquire();
                    String json = ctx.client.put()
                            .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                                    ctx.user.getIntervalsAthleteId(), eventId)
                            .bodyValue(updates)
                            .retrieve().bodyToMono(String.class).block();
                    JsonNode updated = objectMapper.readTree(json);
                    if (updated != null && updated.isObject()) {
                        intervalsMirrorService.saveEvents(user.getId(),
                                objectMapper.createArrayNode().add(updated));
                    }
                    return updated;
                } catch (Exception e) {
                    throw new RuntimeException("Event not found: " + eventId, e);
                }
            }
            Long upstreamId = upstreamIdFor(merged, eventId);
            if (ctx == null) return merged; // no Intervals link — local only
            if (upstreamId == null) {
                // Never reached Intervals — try creating it there now.
                pushEventToIntervals(ctx, (com.fasterxml.jackson.databind.node.ObjectNode) merged);
                return merged;
            }
            try {
                rateLimiter.acquire();
                String json = ctx.client.put()
                        .uri("/api/v1/athlete/{athleteId}/events/{eventId}",
                                ctx.user.getIntervalsAthleteId(), upstreamId)
                        .bodyValue(updates)
                        .retrieve().bodyToMono(String.class).block();
                JsonNode updated = objectMapper.readTree(json);
                if (updated != null && eventId > 0) {
                    intervalsMirrorService.saveEvents(user.getId(),
                            updated.isArray() ? updated : objectMapper.createArrayNode().add(updated));
                }
                return merged;
            } catch (Exception e) {
                log.warn("Intervals update failed for event {} — local master keeps change: {}",
                        eventId, e.getMessage());
                return merged;
            }
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
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
        User user = userService.getUserEntityByUsername(username);
        boolean localMaster = garminClientFactory.isConnected(user.getId());
        if (localMaster) {
            // Master: always remove locally; Intervals delete best-effort.
            // Resolve the upstream id before deleting the local row.
            Long upstreamId = null;
            var row = intervalsEventRepository
                    .findByUserIdAndEventId(user.getId(), String.valueOf(eventId)).orElse(null);
            if (row != null) {
                try {
                    var payload = objectMapper.readTree(row.getPayloadJson());
                    upstreamId = upstreamIdFor(payload, eventId);
                } catch (Exception ignored) {}
            }
            intervalsEventRepository.deleteByUserIdAndEventId(
                    user.getId(), String.valueOf(eventId));
            if (upstreamId == null) return; // never existed upstream
            ApiContext ctx = intervalsCtxOrNull(username);
            if (ctx == null) return;
            try {
                rateLimiter.acquire();
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
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
        User user = userService.getUserEntityByUsername(username);
        if (garminClientFactory.isConnected(user.getId())) {
            // Local DB is master: always write the event locally first with a
            // negative id (compatible with calendar_events and
            // garmin_workout_pushes int columns), then push to Intervals
            // best-effort and remember the upstream id for update/delete.
            var ev = (com.fasterxml.jackson.databind.node.ObjectNode)
                    objectMapper.valueToTree(eventData);
            ev.put("id", nextLocalEventId(user));
            ev.put("sgen_local", true);
            // Scheduler events arrive without category — a workout_doc means
            // WORKOUT, same default Intervals applies.
            if (!ev.hasNonNull("category") && ev.hasNonNull("workout_doc")) {
                ev.put("category", "WORKOUT");
            }
            normalizeEndDate(ev);
            intervalsMirrorService.saveEvents(user.getId(),
                    objectMapper.createArrayNode().add(ev));
            ApiContext ctx = intervalsCtxOrNull(username);
            if (ctx != null) pushEventToIntervals(ctx, ev);
            return ev;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            List<Map<String, Object>> events = List.of(eventData);
            rateLimiter.acquire();
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
            rateLimiter.acquire();
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

    /** Intervals context when the user still has credentials configured,
     *  null otherwise — Garmin-only users may have removed theirs. */
    private ApiContext intervalsCtxOrNull(String username) {
        try {
            return clientFactory.buildContext(userService, username);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Intervals normalizes an end_date_local with a non-midnight time to that
     * same date at 00:00 (i.e. "end of the previous day"). The outbound
     * payload keeps the raw value (Intervals normalizes it), but the locally
     * stored copy must match — otherwise a one-day event renders as two days
     * in our calendar.
     */
    private void normalizeEndDate(com.fasterxml.jackson.databind.node.ObjectNode ev) {
        String ed = ev.path("end_date_local").asText("");
        if (ed.length() >= 19 && !"00:00:00".equals(ed.substring(11, 19))) {
            ev.put("end_date_local", ed.substring(0, 10) + "T00:00:00");
        }
    }

    /**
     * Allocate a local event id. Negative ids must NEVER be reused: a deleted
     * event frees its id, but garmin_workout_pushes and calendar_events keep
     * historical rows keyed by it — reusing the id collides the new event
     * with stale push/deload records. Scan all three tables for the lowest
     * id ever assigned.
     */
    private int nextLocalEventId(com.sgen.entity.User user) {
        int min = 0;
        for (var row : intervalsEventRepository.findByUserId(user.getId())) {
            try {
                int v = Integer.parseInt(row.getEventId());
                if (v < min) min = v;
            } catch (Exception ignored) {}
        }
        for (var push : garminWorkoutPushRepository.findByUserId(user.getId())) {
            Integer v = push.getIntervalsEventId();
            if (v != null && v < min) min = v;
        }
        if (user.getUsername() != null) {
            for (var ce : calendarEventRepository.findByUsernameOrderByEventDate(user.getUsername())) {
                Integer v = ce.getIntervalsEventId();
                if (v != null && v < min) min = v;
            }
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
            normalizeEndDate(node);
            intervalsMirrorService.saveEvents(userId, objectMapper.createArrayNode().add(node));
            return node;
        } catch (Exception e) {
            log.debug("Local event merge for {} failed: {}", eventId, e.getMessage());
            return null;
        }
    }
}
