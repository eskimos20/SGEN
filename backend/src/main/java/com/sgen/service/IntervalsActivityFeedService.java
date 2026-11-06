package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.garmin.IntervalsMirrorService;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fetches the activity list for a period — the heaviest branch of the
 * dashboard fetch. For Garmin-connected users with a populated mirror the
 * list is served verbatim from local mirror rows and enriched with stored
 * streams/icu_intervals; otherwise it comes from the Intervals API with
 * per-activity interval hydration, persisted to the mirror when the user is
 * Garmin-connected.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsActivityFeedService {

    private static final int PARALLEL_REQUESTS = 4;

    private final ObjectMapper objectMapper;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final IntervalsMirrorService intervalsMirrorService;
    private final IntervalsApiClient intervalsApi;

    private final ExecutorService executorService = Executors.newFixedThreadPool(PARALLEL_REQUESTS);

    @PreDestroy
    public void shutdown() {
        executorService.shutdown();
    }

    /**
     * Returns the activity array for the period. Stream payloads fetched or
     * read along the way are collected into {@code streamsMap} (activityId →
     * streams JsonNode) for the analysis step.
     */
    public JsonNode fetch(ApiContext ctx, String oldest, String newest, boolean garminConnected,
                          boolean analyze, Map<String, JsonNode> streamsMap) {
        Long uid = ctx.user.getId();
        String username = ctx.user.getUsername();
        if (garminConnected && intervalsActivityRepository.countByUserId(uid) > 0) {
            return serveFromMirror(ctx, uid, username, oldest, newest, analyze, streamsMap);
        }
        return fetchFromApi(ctx, uid, username, oldest, newest, garminConnected, streamsMap);
    }

    /** Local mirror path: rows → payloads, hydrated with streams/intervals. */
    private JsonNode serveFromMirror(ApiContext ctx, Long uid, String username, String oldest,
                                     String newest, boolean analyze, Map<String, JsonNode> streamsMap) {
        var from = java.time.LocalDateTime.parse(oldest + "T00:00:00");
        var to = java.time.LocalDateTime.parse(newest + "T23:59:59");
        var rows = intervalsActivityRepository
                .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(uid, from, to);
        var arr = com.sgen.util.JsonPayloads.toPayloadArray(
                rows, r -> r.getPayloadJson(), objectMapper);
        log.debug("SOURCE=DB user {} activities served from local mirror: {}", username, arr.size());
        // Hydrate streams/icu_intervals from the mirror — only needed when
        // the Statistics analysis step (analyze=true) consumes them. Skipped
        // entirely for plain period fetches (fitness slider, dashboard).
        if (!analyze) return arr;

        var ids = new ArrayList<String>();
        for (JsonNode n : arr) {
            String id = n.path("id").asText("");
            if (!id.isEmpty()) ids.add(id);
        }
        Map<String, com.sgen.entity.IntervalsActivityStreams> have = new HashMap<>();
        if (!ids.isEmpty()) {
            for (var s : intervalsStreamsRepository.findByUserIdAndActivityIdIn(uid, ids)) {
                have.put(s.getActivityId(), s);
            }
        }
        for (JsonNode n : arr) {
            String id = n.path("id").asText("");
            if (id.isEmpty()) continue;
            var srow = have.get(id);
            JsonNode str = null, ints = null;
            if (srow != null) {
                try { if (srow.getStreamsJson() != null) str = objectMapper.readTree(srow.getStreamsJson()); }
                catch (Exception e) { log.debug("mirror streams parse {}", e.getMessage()); }
                try { if (srow.getIntervalsJson() != null) ints = objectMapper.readTree(srow.getIntervalsJson()); }
                catch (Exception e) { log.debug("mirror intervals parse {}", e.getMessage()); }
                if (ints != null && ints.isObject() && ints.has("icu_intervals"))
                    ints = ints.get("icu_intervals");
            }
            if (str == null || ints == null || (ints.isArray() && ints.isEmpty())) {
                try {
                    if (str == null) {
                        str = intervalsApi.getJson(ctx.client, "/api/v1/activity/{id}/streams", id);
                    }
                    if (ints == null) {
                        JsonNode det = intervalsApi.getJson(ctx.client,
                                b -> b.path("/api/v1/activity/{id}")
                                        .queryParam("intervals", "true").build(id));
                        if (det.has("icu_intervals")) ints = det.get("icu_intervals");
                        if (det.has("icu_max_watts") && !n.has("icu_max_watts")
                                && n instanceof ObjectNode on) {
                            on.set("icu_max_watts", det.get("icu_max_watts"));
                        }
                    }
                    intervalsMirrorService.saveStreams(uid, id, str, ints);
                } catch (Exception e) {
                    log.debug("Mirror streams fetch for {} failed: {}", id, e.getMessage());
                }
            }
            if (ints != null) {
                com.sgen.util.IntervalEnrichment.enrich(ints, str);
                if (n instanceof ObjectNode on) on.set("icu_intervals", ints);
            }
            if (str != null) streamsMap.put(id, str);
        }
        return arr;
    }

    /** API path: list + per-activity interval hydration (parallel). */
    private JsonNode fetchFromApi(ApiContext ctx, Long uid, String username, String oldest,
                                  String newest, boolean garminConnected,
                                  Map<String, JsonNode> streamsMap) {
        String athleteId = ctx.user.getIntervalsAthleteId();
        try {
            JsonNode activitiesNode = intervalsApi.getJson(ctx.client,
                    uriBuilder -> uriBuilder.path("/api/v1/athlete/{id}/activities")
                            .queryParam("oldest", oldest).queryParam("newest", newest)
                            .build(athleteId));

            if (activitiesNode.isArray()) {
                log.debug("SOURCE=INTERVALS user {} fetched {} activities from Intervals API", username, activitiesNode.size());
                log.info("Fetching interval data for {} activities", activitiesNode.size());
                var intervalFutures = new ArrayList<CompletableFuture<Void>>();
                for (JsonNode activity : activitiesNode) {
                    String activityId = activity.path("id").asText();
                    if (activityId == null || activityId.isEmpty()) {
                        continue;
                    }
                    final JsonNode currentActivity = activity;
                    final String currentActivityId = activityId;
                    intervalFutures.add(CompletableFuture.runAsync(() -> {
                        try {
                            JsonNode details = intervalsApi.getJson(ctx.client,
                                    uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                                            .queryParam("intervals", "true").build(currentActivityId));
                            JsonNode streams = null;
                            try {
                                streams = intervalsApi.getJson(ctx.client,
                                        "/api/v1/activity/{id}/streams", currentActivityId);
                                streamsMap.put(currentActivityId, streams);
                            } catch (Exception e) {
                                log.debug("Failed to fetch streams for activity {}: {}", currentActivityId, e.getMessage());
                            }
                            if (details.has("icu_intervals")) {
                                JsonNode intervals = details.get("icu_intervals");
                                com.sgen.util.IntervalEnrichment.enrich(intervals, streams);
                                ((ObjectNode) currentActivity).set("icu_intervals", intervals);
                            }
                            if (details.has("icu_max_watts") && !currentActivity.has("icu_max_watts")) {
                                ((ObjectNode) currentActivity).set("icu_max_watts", details.get("icu_max_watts"));
                            }
                        } catch (Exception e) {
                            log.warn("Failed to fetch intervals for activity {}: {}", currentActivityId, e.getMessage());
                        }
                    }, executorService));
                }
                CompletableFuture.allOf(intervalFutures.toArray(new CompletableFuture[0])).join();
                log.info("Completed fetching interval data for all activities");
                // Garmin-connected but mirror empty: persist everything locally
                // so subsequent requests are served from the DB mirror.
                if (garminConnected) {
                    for (JsonNode activity : activitiesNode) {
                        intervalsMirrorService.saveActivity(uid, activity);
                        String actId = activity.path("id").asText("");
                        intervalsMirrorService.saveStreams(uid, actId,
                                streamsMap.get(actId), activity.get("icu_intervals"));
                    }
                    log.info("Mirror was empty for user {} — persisted {} activities + streams to local mirror",
                            username, activitiesNode.size());
                }
            }
            return activitiesNode;
        } catch (Exception e) {
            log.error("Failed to fetch activities: {}", e.getMessage(), e);
            return null;
        }
    }
}
