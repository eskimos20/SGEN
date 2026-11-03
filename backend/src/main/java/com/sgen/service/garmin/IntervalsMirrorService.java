package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.IntervalsActivity;
import com.sgen.entity.IntervalsActivityStreams;
import com.sgen.entity.IntervalsEvent;
import com.sgen.entity.IntervalsWellness;
import com.sgen.repository.IntervalsActivityRepository;
import com.sgen.repository.IntervalsActivityStreamsRepository;
import com.sgen.repository.IntervalsEventRepository;
import com.sgen.repository.IntervalsWellnessRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Writes verbatim Intervals.icu payloads into the local mirror tables
 * (intervals_activities / intervals_activity_streams / intervals_events).
 * Shared by the historical backfill and the on-demand fetch fallback for
 * Garmin-connected users whose mirror is still empty.
 * Upserts by (user_id, activity_id/event_id) — safe to re-run.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsMirrorService {

    private final IntervalsActivityRepository activityRepository;
    private final IntervalsActivityStreamsRepository streamsRepository;
    private final IntervalsEventRepository eventRepository;
    private final IntervalsWellnessRepository wellnessRepository;
    private final com.sgen.repository.UserDailyLoadRepository dailyLoadRepository;
    private final com.sgen.repository.IntervalsAthleteMirrorRepository athleteMirrorRepository;
    private final ObjectMapper objectMapper;

    public boolean hasActivities(Long userId) {
        return activityRepository.countByUserId(userId) > 0;
    }

    public boolean hasEvents(Long userId) {
        return eventRepository.countByUserId(userId) > 0;
    }

    public boolean hasWellness(Long userId) {
        return wellnessRepository.countByUserId(userId) > 0;
    }

    /**
     * Providers whose data Intervals does not (or may stop) exposing through
     * its API — Strava is already restricted, Garmin is restricted by the new
     * policy. Mirror rows from these sources are never pruned on absence, and
     * stripped response shells never overwrite stored payloads.
     */
    private static final java.util.Set<String> PROTECTED_SOURCES =
            java.util.Set.of("GARMIN_CONNECT", "STRAVA");

    /** Restricted providers return stripped shells: source set but name/type empty. */
    private boolean isRestrictedShell(JsonNode a) {
        return PROTECTED_SOURCES.contains(a.path("source").asText(""))
                && a.path("name").asText("").isEmpty()
                && a.path("type").asText("").isEmpty();
    }

    /** Persist an Intervals activity JSON; merges into an existing payload so a
     *  stripped response can never clobber stored fields. */
    public void saveActivity(Long userId, JsonNode a) {
        mergeActivityPayload(userId, a);
    }

    /** Persist already-fetched streams/intervals JSON for one activity. */
    public void saveStreams(Long userId, String activityId, JsonNode streams, JsonNode intervals) {
        if (activityId == null || activityId.isBlank() || (streams == null && intervals == null)) return;
        try {
            var row = streamsRepository.findByUserIdAndActivityId(userId, activityId)
                    .orElseGet(() -> IntervalsActivityStreams.builder().userId(userId).activityId(activityId).build());
            if (streams != null) row.setStreamsJson(objectMapper.writeValueAsString(streams));
            if (intervals != null) row.setIntervalsJson(objectMapper.writeValueAsString(intervals));
            streamsRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist streams for {} failed: {}", activityId, e.getMessage());
        }
    }

    /** Persist every row of an Intervals wellness array (id = ISO date). */
    public void saveWellness(Long userId, JsonNode wellness) {
        if (wellness == null || !wellness.isArray()) return;
        for (JsonNode w : wellness) {
            saveWellnessNode(userId, w);
        }
    }

    /** Persist wellness rows already converted to Maps (CalendarController path). */
    public void saveWellnessRows(Long userId, java.util.List<java.util.Map<String, Object>> rows) {
        if (rows == null) return;
        for (var row : rows) {
            saveWellnessNode(userId, objectMapper.valueToTree(row));
        }
    }

    private void saveWellnessNode(Long userId, JsonNode w) {
        try {
            String id = w.path("id").asText("");
            if (id.length() < 10) return;
            java.time.LocalDate date = java.time.LocalDate.parse(id.substring(0, 10));
            var row = wellnessRepository.findByUserIdAndWellnessDate(userId, date)
                    .orElseGet(() -> IntervalsWellness.builder().userId(userId).wellnessDate(date).build());
            if (row.getPayloadJson() != null && w.isObject()) {
                // Merge so a stripped response can't wipe stored fields.
                ObjectNode merged = (ObjectNode) objectMapper.readTree(row.getPayloadJson());
                merged.setAll((ObjectNode) w);
                row.setPayloadJson(objectMapper.writeValueAsString(merged));
            } else {
                row.setPayloadJson(objectMapper.writeValueAsString(w));
            }
            wellnessRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist wellness failed: {}", e.getMessage());
        }
    }

    /** Verbatim wellness payloads for a range — same List<Map> shape the API path produces. */
    public java.util.List<java.util.Map<String, Object>> findWellnessPayloads(
            Long userId, java.time.LocalDate from, java.time.LocalDate to) {
        var out = new java.util.ArrayList<java.util.Map<String, Object>>();
        for (var row : wellnessRepository
                .findByUserIdAndWellnessDateBetweenOrderByWellnessDateAsc(userId, from, to)) {
            try {
                @SuppressWarnings("unchecked")
                var m = objectMapper.readValue(row.getPayloadJson(), java.util.Map.class);
                out.add(m);
            } catch (Exception e) {
                log.debug("Mirror wellness parse failed: {}", e.getMessage());
            }
        }
        return out;
    }

    /** Athlete profile row, or null. kind: "athlete" | "sport-settings". */
    public String findAthleteJson(Long userId, String kind) {
        return athleteMirrorRepository.findByUserId(userId)
                .map(m -> "sport-settings".equals(kind) ? m.getSportSettingsJson() : m.getAthleteJson())
                .filter(s -> s != null && !s.isBlank()).orElse(null);
    }

    /** True when the stored athlete row is fresher than the given age (hours). */
    public boolean athleteMirrorFresh(Long userId, long maxAgeHours) {
        return athleteMirrorRepository.findByUserId(userId)
                .map(m -> m.getUpdatedAt() != null
                        && m.getUpdatedAt().isAfter(java.time.LocalDateTime.now().minusHours(maxAgeHours)))
                .orElse(false);
    }

    public synchronized void saveAthleteProfile(Long userId, String athleteJson, String sportSettingsJson) {
        try {
            var row = athleteMirrorRepository.findByUserId(userId)
                    .orElseGet(() -> com.sgen.entity.IntervalsAthleteMirror.builder().userId(userId).build());
            if (athleteJson != null) row.setAthleteJson(athleteJson);
            if (sportSettingsJson != null) row.setSportSettingsJson(sportSettingsJson);
            athleteMirrorRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist athlete failed: {}", e.getMessage());
        }
    }

    /** Persist a wellness-bulk update into the mirror payload (field-level merge). */
    public void mergeWellnessUpdate(Long userId, java.util.Map<String, Object> update) {
        try {
            Object idObj = update.get("id");
            if (idObj == null) return;
            String id = String.valueOf(idObj);
            if (id.length() < 10) return;
            java.time.LocalDate date = java.time.LocalDate.parse(id.substring(0, 10));
            var row = wellnessRepository.findByUserIdAndWellnessDate(userId, date)
                    .orElseGet(() -> IntervalsWellness.builder().userId(userId).wellnessDate(date).build());
            ObjectNode merged;
            if (row.getPayloadJson() != null) {
                merged = (ObjectNode) objectMapper.readTree(row.getPayloadJson());
            } else {
                merged = objectMapper.createObjectNode();
            }
            ObjectNode upd = objectMapper.valueToTree(update);
            merged.setAll(upd);
            row.setPayloadJson(objectMapper.writeValueAsString(merged));
            wellnessRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror wellness update merge failed: {}", e.getMessage());
        }
    }

    /** Raw stored streams payload for an activity, or null. */
    public String findStreamsJson(Long userId, String activityId) {
        return streamsRepository.findByUserIdAndActivityId(userId, activityId)
                .map(com.sgen.entity.IntervalsActivityStreams::getStreamsJson)
                .filter(s -> s != null && !s.isBlank()).orElse(null);
    }

    /** Stored best-efforts response for an activity, or null. */
    public String findBestEffortsJson(Long userId, String activityId) {
        return streamsRepository.findByUserIdAndActivityId(userId, activityId)
                .map(com.sgen.entity.IntervalsActivityStreams::getBestEffortsJson).orElse(null);
    }

    public void saveBestEfforts(Long userId, String activityId, String json) {
        if (activityId == null || activityId.isBlank() || json == null) return;
        try {
            var row = streamsRepository.findByUserIdAndActivityId(userId, activityId)
                    .orElseGet(() -> IntervalsActivityStreams.builder()
                            .userId(userId).activityId(activityId).streamsJson("").build());
            row.setBestEffortsJson(json);
            streamsRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist best-efforts for {} failed: {}", activityId, e.getMessage());
        }
    }

    /** Stored rendered PNG for an activity, or null. kind: "map" | "chart". */
    public byte[] findImage(Long userId, String activityId, String kind) {
        return streamsRepository.findByUserIdAndActivityId(userId, activityId)
                .map(s -> "chart".equals(kind) ? s.getChartPng() : s.getMapPng()).orElse(null);
    }

    public void saveImage(Long userId, String activityId, String kind, byte[] png) {
        if (activityId == null || activityId.isBlank() || png == null || png.length == 0) return;
        try {
            var row = streamsRepository.findByUserIdAndActivityId(userId, activityId)
                    .orElseGet(() -> IntervalsActivityStreams.builder()
                            .userId(userId).activityId(activityId).streamsJson("").build());
            if ("chart".equals(kind)) row.setChartPng(png); else row.setMapPng(png);
            streamsRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist {} image for {} failed: {}", kind, activityId, e.getMessage());
        }
    }

    /**
     * Merge a partial (fields-limited) Intervals activity payload into the
     * stored row — used by endpoints that only request a subset of fields so
     * the full payload is never clobbered. Creates the row when missing.
     */
    public void mergeActivityPayload(Long userId, JsonNode a) {
        try {
            String id = a.path("id").asText("");
            if (id.isBlank() || isRestrictedShell(a)) return;
            var row = activityRepository.findByUserIdAndActivityId(userId, id)
                    .orElseGet(() -> IntervalsActivity.builder().userId(userId).activityId(id).build());
            ObjectNode merged;
            if (row.getPayloadJson() != null) {
                merged = (ObjectNode) objectMapper.readTree(row.getPayloadJson());
                merged.setAll((ObjectNode) a);
            } else {
                merged = (ObjectNode) a;
            }
            String ds = merged.path("start_date_local").asText("");
            if (ds.length() >= 19) row.setStartDateLocal(java.time.LocalDateTime.parse(ds.substring(0, 19)));
            if (merged.hasNonNull("moving_time")) row.setMovingTimeS(merged.get("moving_time").asInt());
            row.setTrainingLoad(merged.path("icu_training_load").asDouble(0));
            if (merged.hasNonNull("type")) row.setActivityType(merged.get("type").asText());
            row.setPayloadJson(objectMapper.writeValueAsString(merged));
            activityRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror merge activity failed: {}", e.getMessage());
        }
    }

    /**
     * Delete mirror activities in [from,to] whose ids are absent from keepIds
     * (removed upstream). Also drops their streams row and the INTERVALS
     * daily-load row for that date — recordIntervalsLoads rebuilds it when a
     * surviving activity remains on the same day.
     */
    @org.springframework.transaction.annotation.Transactional
    public void pruneActivities(Long userId, java.time.LocalDateTime from,
                                java.time.LocalDateTime to, java.util.Set<String> keepIds) {
        try {
            for (var row : activityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(userId, from, to)) {
                if (keepIds.contains(row.getActivityId())) continue;
                // Absence only proves deletion for sources Intervals still
                // serves — restricted providers may be filtered from the API.
                String source = null;
                try {
                    source = objectMapper.readTree(row.getPayloadJson()).path("source").asText(null);
                } catch (Exception ignored) {}
                if (source == null || PROTECTED_SOURCES.contains(source)) continue;
                activityRepository.deleteByUserIdAndActivityId(userId, row.getActivityId());
                streamsRepository.deleteByUserIdAndActivityId(userId, row.getActivityId());
                if (row.getStartDateLocal() != null) {
                    dailyLoadRepository.deleteByUserIdAndLoadDateAndSource(
                            userId, row.getStartDateLocal().toLocalDate(), "INTERVALS");
                }
                log.info("Pruned mirror activity {} (deleted upstream)", row.getActivityId());
            }
        } catch (Exception e) {
            log.debug("Mirror activity prune failed: {}", e.getMessage());
        }
    }

    /** Same pruning for events in [from,to] whose ids are absent upstream. */
    @org.springframework.transaction.annotation.Transactional
    public void pruneEvents(Long userId, java.time.LocalDateTime from,
                            java.time.LocalDateTime to, java.util.Set<String> keepIds) {
        try {
            for (var row : eventRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(userId, from, to)) {
                if (keepIds.contains(row.getEventId())) continue;
                eventRepository.deleteByUserIdAndEventId(userId, row.getEventId());
                log.info("Pruned mirror event {} (deleted upstream)", row.getEventId());
            }
        } catch (Exception e) {
            log.debug("Mirror event prune failed: {}", e.getMessage());
        }
    }

    /** Persist every event in an Intervals events array. */
    public void saveEvents(Long userId, JsonNode events) {
        if (events == null || !events.isArray()) return;
        for (JsonNode ev : events) {
            try {
                String id = ev.path("id").asText("");
                if (id.isBlank()) continue;
                var row = eventRepository.findByUserIdAndEventId(userId, id)
                        .orElseGet(() -> IntervalsEvent.builder().userId(userId).eventId(id).build());
                String ds = ev.path("start_date_local").asText("");
                if (ds.length() >= 19) row.setStartDateLocal(java.time.LocalDateTime.parse(ds.substring(0, 19)));
                row.setCategory(ev.path("category").asText(null));
                row.setPayloadJson(objectMapper.writeValueAsString(ev));
                eventRepository.save(row);
            } catch (Exception e) {
                log.debug("Mirror persist event failed: {}", e.getMessage());
            }
        }
    }
}
