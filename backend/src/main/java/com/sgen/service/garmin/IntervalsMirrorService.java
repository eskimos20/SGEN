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
    private final com.sgen.repository.IntervalsDocumentRepository documentRepository;
    private final com.sgen.repository.UserDailyLoadRepository dailyLoadRepository;
    private final com.sgen.repository.IntervalsAthleteMirrorRepository athleteMirrorRepository;
    private final ObjectMapper objectMapper;
    private final org.springframework.context.ApplicationEventPublisher eventPublisher;

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
            if (streams != null) {
                row.setStreamsJson(objectMapper.writeValueAsString(streams));
                // Precompute per-activity curves at persist time so curve history
                // merges tiny precomputed objects instead of re-parsing streams.
                var normalized = com.sgen.service.garmin.CurveCalculator.normalizeStreams(streams);
                if (normalized != null) {
                    var curves = com.sgen.service.garmin.CurveCalculator.computeCurves(
                            normalized, "watts", "heartrate", "velocity_smooth");
                    if (!curves.isEmpty()) row.setCurvesJson(objectMapper.writeValueAsString(curves));
                }
            }
            if (intervals != null) row.setIntervalsJson(objectMapper.writeValueAsString(intervals));
            streamsRepository.save(row);
            if (streams != null && !streams.isEmpty()) {
                eventPublisher.publishEvent(new StreamsPersistedEvent(userId, activityId));
            }
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
            projectWellnessFields(row, w);
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
            if (Boolean.TRUE.equals(row.getProjected())) {
                out.add(projectedWellnessMap(row));
                continue;
            }
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
                eventPublisher.publishEvent(new ActivityRemovedEvent(userId, row.getActivityId()));
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

    /** Drop the INTERVALS daily-load row for a date — recordIntervalsLoads
     *  rebuilds it from the surviving activities on next fetch. */
    public void deleteIntervalsDailyLoad(Long userId, java.time.LocalDate date) {
        try {
            dailyLoadRepository.deleteByUserIdAndLoadDateAndSource(userId, date, "INTERVALS");
        } catch (Exception e) {
            log.debug("Daily-load delete failed for {} on {}: {}", userId, date, e.getMessage());
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

    /** Persist a mirrored document (athlete profile, sport settings). */
    public void saveDoc(Long userId, String docKey, JsonNode doc) {
        if (doc == null || docKey == null) return;
        try {
            var row = documentRepository.findByUserIdAndDocKey(userId, docKey)
                    .orElseGet(() -> com.sgen.entity.IntervalsDocument.builder()
                            .userId(userId).docKey(docKey).build());
            row.setPayloadJson(objectMapper.writeValueAsString(doc));
            documentRepository.save(row);
        } catch (Exception e) {
            log.warn("Mirror persist doc {} failed: {}", docKey, e.getMessage());
        }
    }

    /** Read a mirrored document, or null when absent. */
    public JsonNode getDoc(Long userId, String docKey) {
        try {
            var row = documentRepository.findByUserIdAndDocKey(userId, docKey).orElse(null);
            return row != null ? objectMapper.readTree(row.getPayloadJson()) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Extract the served fields into real columns at persist time. */
    private void projectWellnessFields(com.sgen.entity.IntervalsWellness row, JsonNode w) {
        try {
            row.setCtl(num(w, "ctl")); row.setAtl(num(w, "atl")); row.setTsb(num(w, "tsb"));
            row.setRampRate(num(w, "rampRate")); row.setHrv(num(w, "hrv"));
            row.setRestingHr(intNum(w, "restingHR"));
            row.setSleepSecs(intNum(w, "sleepSecs")); row.setSleepScore(num(w, "sleepScore"));
            row.setWeightKg(num(w, "weight")); row.setSpO2(num(w, "spO2"));
            row.setReadiness(num(w, "readiness")); row.setFatigue(num(w, "fatigue"));
            row.setMood(num(w, "mood")); row.setSoreness(num(w, "soreness"));
            row.setStress(num(w, "stress"));
            row.setProjected(true);
        } catch (Exception e) {
            log.debug("Wellness projection failed for {}: {}", row.getWellnessDate(), e.getMessage());
        }
    }

    /** Build the served map straight from columns — no JSON parsing. */
    private java.util.Map<String, Object> projectedWellnessMap(com.sgen.entity.IntervalsWellness r) {
        var m = new java.util.HashMap<String, Object>();
        m.put("id", r.getWellnessDate().toString());
        if (r.getCtl() != null) m.put("ctl", r.getCtl());
        if (r.getAtl() != null) m.put("atl", r.getAtl());
        if (r.getTsb() != null) m.put("tsb", r.getTsb());
        if (r.getRampRate() != null) m.put("rampRate", r.getRampRate());
        if (r.getHrv() != null) m.put("hrv", r.getHrv());
        if (r.getRestingHr() != null) m.put("restingHR", r.getRestingHr());
        if (r.getSleepSecs() != null) m.put("sleepSecs", r.getSleepSecs());
        if (r.getSleepScore() != null) m.put("sleepScore", r.getSleepScore());
        if (r.getWeightKg() != null) m.put("weight", r.getWeightKg());
        if (r.getSpO2() != null) m.put("spO2", r.getSpO2());
        if (r.getReadiness() != null) m.put("readiness", r.getReadiness());
        if (r.getFatigue() != null) m.put("fatigue", r.getFatigue());
        if (r.getMood() != null) m.put("mood", r.getMood());
        if (r.getSoreness() != null) m.put("soreness", r.getSoreness());
        if (r.getStress() != null) m.put("stress", r.getStress());
        return m;
    }

    private Double num(JsonNode n, String k) {
        return n.hasNonNull(k) && n.get(k).isNumber() ? n.get(k).asDouble() : null;
    }

    private Integer intNum(JsonNode n, String k) {
        return n.hasNonNull(k) && n.get(k).isNumber() ? n.get(k).asInt() : null;
    }
}
