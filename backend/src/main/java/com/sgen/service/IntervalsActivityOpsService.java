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
    private final IntervalsActivityDetailService activityDetailService;

    public Map<String, Object> updateActivity(String username, String activityId, Map<String, Object> updates) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
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

    // -------------------------------------------------------------------------
    // Interval & best-effort — delegate to analysis service
    // -------------------------------------------------------------------------

    public JsonNode fetchActivityBestEfforts(String username, String activityId) {
        return analysisService.fetchActivityBestEfforts(username, activityId);
    }

    public JsonNode findBestEfforts(String username, String activityId, String stream,
                                    Integer duration, Integer count, Float minValue,
                                    Boolean excludeIntervals) {
        return analysisService.findBestEfforts(username, activityId, stream, duration, count, minValue, excludeIntervals);
    }

    public List<Map<String, Object>> computeIntervalsFromStreams(String username, String activityId,
                                                                  String stream, Integer duration, Integer count,
                                                                  Integer skipSeconds, Integer cooldownSeconds) {
        return analysisService.computeIntervalsFromStreams(username, activityId, stream, duration, count, skipSeconds, cooldownSeconds);
    }

    public JsonNode updateActivityIntervals(String username, String activityId,
                                            List<Map<String, Object>> intervals,
                                            Integer searchDuration) {
        try {
            Map<String, Object> details = activityDetailService.getActivityDetails(username, activityId);
            JsonNode activityNode = (JsonNode) details.get("activity");
            JsonNode streamsNode = (JsonNode) details.get("streams");
            JsonNode result = analysisService.updateActivityIntervals(username, activityId, intervals, searchDuration, activityNode, streamsNode);
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
        return analysisService.extractIntervalSummary(icuIntervals);
    }

    // -------------------------------------------------------------------------
    // Upload
    // -------------------------------------------------------------------------

    public JsonNode uploadActivity(String username, MultipartFile file, String name, String description) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            byte[] fileBytes = file.getBytes();
            String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "activity.fit";
            MultipartBodyBuilder builder = new MultipartBodyBuilder();
            builder.part("file", new ByteArrayResource(fileBytes) {
                @Override
                public String getFilename() { return originalFilename; }
            }).header("Content-Disposition", "form-data; name=file; filename=" + originalFilename);

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

            return objectMapper.readTree(responseJson);
        } catch (Exception e) {
            log.error("Failed to upload activity for user {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to upload activity: " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Power Curve History
    // -------------------------------------------------------------------------


}
