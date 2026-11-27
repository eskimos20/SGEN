package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.garmin.IntervalsMirrorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriBuilder;
import org.springframework.http.client.MultipartBodyBuilder;

import java.util.List;
import java.util.Map;

/**
 * Activity mutations and per-activity operations: update, delete, upload,
 * interval edits and best-effort lookups. Interval math itself lives in
 * IntervalsActivityAnalysisService — this class orchestrates and keeps the
 * local mirror consistent after mutations.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsActivityOpsService {

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final IntervalsMirrorService intervalsMirrorService;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final ActivityAnalysisService activityAnalysisService;
    private final IntervalsActivityAnalysisService analysisService;
    private final IntervalsIntervalService intervalsIntervalService;
    private final IntervalsActivityDetailService activityDetailService;
    private final com.sgen.repository.GarminActivityRepository garminActivityRepository;
    private final com.sgen.repository.GarminActivityStreamsRepository garminActivityStreamsRepository;
    private final com.sgen.repository.GarminActivityIntervalRepository garminActivityIntervalRepository;
    private final com.sgen.repository.UserDailyLoadRepository dailyLoadRepository;
    private final com.sgen.service.garmin.GarminMergeService garminMergeService;
    private final com.sgen.service.garmin.FitnessModelService fitnessModelService;
    private final com.sgen.util.IntervalsApiRateLimiter rateLimiter;

    public Map<String, Object> updateActivity(String username, String activityId, Map<String, Object> updates) {
        if (activityId != null && activityId.startsWith("garmin_")) {
            return updateLocalGarminActivity(username, activityId, updates);
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
            String responseJson = ctx.client.put()
                    .uri("/api/v1/activity/{id}", activityId)
                    .bodyValue(updates)
                    .retrieve().bodyToMono(String.class).block();
            @SuppressWarnings("unchecked")
            Map<String, Object> result = objectMapper.readValue(responseJson, Map.class);
            if (garminClientFactory.isConnected(ctx.user.getId())) {
                try {
                    intervalsMirrorService.saveActivity(ctx.user.getId(), objectMapper.readTree(responseJson));
                } catch (Exception e) {
                    log.debug("Mirror persist updated activity {} failed: {}", activityId, e.getMessage());
                }
            }
            if (updates.containsKey("type")) {
                log.info("Activity {} type changed to {} — resetting analysis for recompute",
                        activityId, updates.get("type"));
                activityAnalysisService.resetForTypeChange(ctx.user.getId(), activityId);
            }
            return result;
        } catch (Exception e) {
            log.error("Failed to update activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to update activity: " + e.getMessage());
        }
    }

    public void deleteActivity(String username, String activityId) {
        // garmin_ ids are local activities — delete from the Garmin tables,
        // drop the day's GARMIN load, and remove the uploaded Intervals
        // copy best-effort.
        if (activityId != null && activityId.startsWith("garmin_")) {
            deleteLocalGarminActivity(username, activityId);
            return;
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
            ctx.client.delete()
                    .uri("/api/v1/activity/{activityId}", activityId)
                    .retrieve().bodyToMono(Void.class).block();
            // Keep the mirror consistent so the activity doesn't reappear.
            Long uid = ctx.user.getId();
            if (garminClientFactory.isConnected(uid)) {
                intervalsActivityRepository.findByUserIdAndActivityId(uid, activityId)
                        .ifPresent(act -> {
                            if (act.getStartDateLocal() != null) {
                                intervalsMirrorService.deleteIntervalsDailyLoad(
                                        uid, act.getStartDateLocal().toLocalDate());
                            }
                            intervalsActivityRepository.delete(act);
                        });
                intervalsStreamsRepository.findByUserIdAndActivityId(uid, activityId)
                        .ifPresent(intervalsStreamsRepository::delete);
            }
            // Drop analysis + every result the activity produced (FTP/VO2
            // top-3, records, achievements) — they are not rebuilt.
            activityAnalysisService.purgeForDeletedActivity(uid, activityId);
        } catch (Exception e) {
            log.error("Failed to delete activity {}: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to delete activity: " + e.getMessage());
        }
    }

    /**
     * Local delete for garmin_ activities: children first (streams,
     * intervals), then the activity; the day's GARMIN daily-load row is
     * removed and rebuildGarminLoads recomputes the rest. The uploaded
     * Intervals copy is deleted best-effort via the stored link (or the
     * timestamp heuristic for activities uploaded before the link existed).
     */
    private void deleteLocalGarminActivity(String username, String activityId) {
        Long uid = userService.getUserEntityByUsername(username).getId();
        Long gid = Long.parseLong(activityId.substring("garmin_".length()));
        var act = garminActivityRepository.findById(gid)
                .orElseThrow(() -> new RuntimeException("Garmin activity not found: " + activityId));
        if (!act.getUserId().equals(uid)) {
            throw new RuntimeException("Activity does not belong to user");
        }
        java.time.LocalDate day = act.getStartDateLocal() != null
                ? act.getStartDateLocal().toLocalDate() : null;
        garminActivityIntervalRepository.deleteByActivityId(gid);
        garminActivityStreamsRepository.deleteByActivityId(gid);
        garminActivityRepository.delete(act);
        if (day != null) {
            dailyLoadRepository.deleteByUserIdAndLoadDateAndSource(uid, day, "GARMIN");
        }
        fitnessModelService.rebuildGarminLoads(uid);
        activityAnalysisService.purgeForDeletedActivity(uid, activityId);
        deleteIntervalsCopy(username, uid, act, day);
    }

    /** Best-effort upstream delete of the Intervals copy of a Garmin activity. */
    private void deleteIntervalsCopy(String username, Long uid,
                                     com.sgen.entity.GarminActivity act, java.time.LocalDate day) {
        try {
            String targetId = act.getIntervalsActivityId();
            if (targetId == null || targetId.isBlank()) {
                if (day == null) return;
                for (var row : intervalsActivityRepository
                        .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(
                                uid, day.atStartOfDay(), day.plusDays(1).atStartOfDay())) {
                    JsonNode payload = objectMapper.readTree(row.getPayloadJson());
                    if (garminMergeService.isDuplicateOfLocal(List.of(act), payload)) {
                        targetId = row.getActivityId();
                        break;
                    }
                }
            }
            if (targetId == null || targetId.isBlank()) return;
            ApiContext ctx = clientFactory.buildContext(userService, username);
            rateLimiter.acquire();
            ctx.client.delete()
                    .uri("/api/v1/activity/{id}", targetId)
                    .retrieve().bodyToMono(Void.class).block();
            final String tid = targetId;
            intervalsActivityRepository.findByUserIdAndActivityId(uid, tid)
                    .ifPresent(intervalsActivityRepository::delete);
            intervalsStreamsRepository.findByUserIdAndActivityId(uid, tid)
                    .ifPresent(intervalsStreamsRepository::delete);
            if (day != null) {
                intervalsMirrorService.deleteIntervalsDailyLoad(uid, day);
            }
        } catch (Exception e) {
            log.debug("Upstream delete of Intervals copy for garmin activity {} failed: {}",
                    act.getId(), e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Interval & best-effort — delegate to analysis service
    // -------------------------------------------------------------------------

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        return intervalsIntervalService.fetchActivityBestEfforts(username, activityId);
    }

    public JsonNode findBestEfforts(String username, String activityId, String stream,
                                    Integer duration, Integer count, Float minValue,
                                    Boolean excludeIntervals) {
        return intervalsIntervalService.findBestEfforts(username, activityId, stream, duration, count, minValue, excludeIntervals);
    }

    public List<Map<String, Object>> computeIntervalsFromStreams(String username, String activityId,
                                                                  String stream, Integer duration, Integer count,
                                                                  Integer skipSeconds, Integer cooldownSeconds) {
        return intervalsIntervalService.computeIntervalsFromStreams(username, activityId, stream, duration, count, skipSeconds, cooldownSeconds);
    }

    public JsonNode updateActivityIntervals(String username, String activityId,
                                            List<Map<String, Object>> intervals,
                                            Integer searchDuration) {
        // garmin_ intervals live in garmin_activity_intervals — replace the
        // rows locally, no Intervals calls.
        if (activityId != null && activityId.startsWith("garmin_")) {
            try {
                return intervalsIntervalService.updateLocalGarminIntervals(username, activityId, intervals);
            } catch (Exception e) {
                log.error("Failed to update local intervals for {}: {}", activityId, e.getMessage());
                throw new RuntimeException("Failed to update intervals: " + e.getMessage());
            }
        }
        try {
            Map<String, Object> details = activityDetailService.getActivityDetails(username, activityId);
            JsonNode activityNode = (JsonNode) details.get("activity");
            JsonNode streamsNode = (JsonNode) details.get("streams");
            JsonNode result = intervalsIntervalService.updateActivityIntervals(username, activityId, intervals, searchDuration, activityNode, streamsNode);
            // Enrich the returned intervals with start/end HR and HRR so the values
            // are available immediately without refetching activity details.
            if (result != null) {
                JsonNode resultIntervals = result.isArray() ? result : result.path("icu_intervals");
                if (resultIntervals.isArray()) {
                    com.sgen.util.IntervalEnrichment.enrich(resultIntervals, streamsNode);
                }
            }
            return result;
        } catch (Exception e) {
            log.error("Failed to update intervals for activity {}: {}", activityId, e.getMessage(), e);
            throw new RuntimeException("Failed to update intervals: " + e.getMessage());
        }
    }

    public Map<String, Object> extractIntervalSummary(JsonNode icuIntervals) {
        return intervalsIntervalService.extractIntervalSummary(icuIntervals);
    }

    /**
     * Local edit path for garmin_ activities: Intervals doesn't know the
     * garmin_<id> synthetic ids, so we update garmin_activities directly.
     * icu_training_load writes set loadOverridden so the calculator never
     * overwrites the user's value. The Intervals copy (if the session was
     * also synced there) is updated best-effort to keep data consistent.
     */
    private Map<String, Object> updateLocalGarminActivity(String username, String activityId, Map<String, Object> updates) {
        // Identity via the user record — Garmin-only users may have removed
        // their Intervals credentials, so no Intervals context is needed here.
        Long uid = userService.getUserEntityByUsername(username).getId();
        Long gid = Long.parseLong(activityId.substring("garmin_".length()));
        com.sgen.entity.GarminActivity act = garminActivityRepository.findById(gid)
                .orElseThrow(() -> new RuntimeException("Garmin activity not found: " + activityId));
        if (!act.getUserId().equals(uid)) {
            throw new RuntimeException("Activity does not belong to user");
        }
        if (updates.containsKey("name")) {
            act.setName((String) updates.get("name"));
            act.setNameOverridden(true);
        }
        if (updates.containsKey("icu_training_load")) {
            Object v = updates.get("icu_training_load");
            act.setTrainingLoad(v != null ? ((Number) v).doubleValue() : null);
            act.setLoadOverridden(true);
        }
        if (updates.containsKey("icu_rpe")) {
            Object v = updates.get("icu_rpe");
            act.setRpe(v != null ? ((Number) v).intValue() : null);
        }
        if (updates.containsKey("feel")) {
            Object v = updates.get("feel");
            act.setFeel(v != null ? ((Number) v).intValue() : null);
        }
        if (updates.containsKey("description")) {
            act.setDescription((String) updates.get("description"));
        }
        if (updates.containsKey("type")) {
            String t = String.valueOf(updates.get("type"));
            act.setIcuType(t);
            act.setSportType(intervalsTypeToSportKey(t));
        }
        garminActivityRepository.save(act);
        fitnessModelService.rebuildGarminLoads(uid);
        ApiContext ctx = null;
        try { ctx = clientFactory.buildContext(userService, username); } catch (Exception ignored) {}
        if (ctx != null) pushToIntervalsCopy(ctx, act, updates);
        return objectMapper.convertValue(garminMergeService.toIntervalsActivityJson(act), Map.class);
    }

    private String intervalsTypeToSportKey(String type) {
        if (type == null) return "other";
        return switch (type) {
            case "Run", "VirtualRun", "TrailRun" -> "run";
            case "Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide", "EMountainBikeRide", "TrackRide" -> "ride";
            case "Swim", "OpenWaterSwim" -> "swim";
            case "Walk", "Hike" -> "walk";
            default -> "other";
        };
    }

    /** Best-effort mirror of editable fields onto the Intervals copy. */
    private static final java.util.Set<String> UPSTREAM_FIELDS =
            java.util.Set.of("name", "icu_rpe", "feel", "description", "icu_training_load", "type");

    private void pushToIntervalsCopy(ApiContext ctx, com.sgen.entity.GarminActivity act, Map<String, Object> updates) {
        if (act.getStartDateLocal() == null) return;
        var upstream = new java.util.HashMap<String, Object>();
        for (String f : UPSTREAM_FIELDS) {
            if (updates.containsKey(f)) upstream.put(f, updates.get(f));
        }
        if (upstream.isEmpty()) return;
        try {
            String linkedId = act.getIntervalsActivityId();
            if (linkedId != null && !linkedId.isBlank()) {
                rateLimiter.acquire();
                ctx.client.put().uri("/api/v1/activity/{id}", linkedId)
                        .bodyValue(upstream)
                        .retrieve().bodyToMono(String.class).block();
                intervalsActivityRepository.findByUserIdAndActivityId(ctx.user.getId(), linkedId)
                        .ifPresent(row -> {
                            try {
                                JsonNode payload = objectMapper.readTree(row.getPayloadJson());
                                if (payload instanceof com.fasterxml.jackson.databind.node.ObjectNode on) {
                                    upstream.forEach((k, v) -> on.set(k, objectMapper.valueToTree(v)));
                                    row.setPayloadJson(on.toString());
                                    intervalsActivityRepository.save(row);
                                }
                            } catch (Exception ignored) {}
                        });
                return;
            }
            var day = act.getStartDateLocal().toLocalDate();
            for (var row : intervalsActivityRepository
                    .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(
                            ctx.user.getId(), day.atStartOfDay(), day.plusDays(1).atStartOfDay())) {
                JsonNode payload = objectMapper.readTree(row.getPayloadJson());
                if (garminMergeService.isDuplicateOfLocal(List.of(act), payload)) {
                    rateLimiter.acquire();
                    ctx.client.put().uri("/api/v1/activity/{id}", row.getActivityId())
                            .bodyValue(upstream)
                            .retrieve().bodyToMono(String.class).block();
                    // Remember the link — the next update skips the heuristic.
                    act.setIntervalsActivityId(row.getActivityId());
                    garminActivityRepository.save(act);
                    if (payload instanceof com.fasterxml.jackson.databind.node.ObjectNode on) {
                        upstream.forEach((k, v) -> on.set(k, objectMapper.valueToTree(v)));
                        row.setPayloadJson(on.toString());
                        intervalsActivityRepository.save(row);
                    }
                    return;
                }
            }
        } catch (Exception e) {
            log.debug("Intervals sync for garmin activity {} failed: {}", act.getId(), e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Upload
    // -------------------------------------------------------------------------

    public JsonNode uploadActivity(String username, MultipartFile file, String name, String description) {
        try {
            String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "activity.fit";
            return uploadActivity(username, file.getBytes(), originalFilename, name, description);
        } catch (java.io.IOException e) {
            log.error("Failed to upload activity for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to upload activity: " + e.getMessage());
        }
    }

    public JsonNode uploadActivity(String username, byte[] fileBytes, String originalFilename, String name, String description) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            MultipartBodyBuilder builder = new MultipartBodyBuilder();
            builder.part("file", new ByteArrayResource(fileBytes) {
                @Override
                public String getFilename() { return originalFilename; }
            }).header("Content-Disposition", "form-data; name=file; filename=" + originalFilename);

            rateLimiter.acquire();
            String responseJson = ctx.client.post()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/api/v1/athlete/{athleteId}/activities");
                        if (name != null && !name.isBlank()) uriBuilder.queryParam("name", name);
                        if (description != null && !description.isBlank()) uriBuilder.queryParam("description", description);
                        return uriBuilder.build(ctx.user.getIntervalsAthleteId());
                    })
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                            response -> response.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("API error " + response.statusCode() + ": " + body)))
                    .bodyToMono(String.class).block();

            JsonNode uploaded = objectMapper.readTree(responseJson);
            // Garmin-connected: keep the mirror warm so the new upload is
            // visible immediately without another Intervals read.
            if (garminClientFactory.isConnected(ctx.user.getId()) && uploaded != null) {
                try {
                    intervalsMirrorService.saveActivity(ctx.user.getId(), uploaded);
                } catch (Exception e) {
                    log.debug("Mirror persist of uploaded activity failed: {}", e.getMessage());
                }
            }
            return uploaded;
        } catch (Exception e) {
            log.error("Failed to upload activity for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to upload activity: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Power Curve History
    // -------------------------------------------------------------------------


}
