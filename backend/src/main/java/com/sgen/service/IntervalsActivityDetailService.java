package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.garmin.IntervalsMirrorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Activity detail view — single-activity payload with streams, power/pace
 * curves and map data. Garmin-connected users are served from the local
 * mirror with lazy Intervals healing of missing pieces.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsActivityDetailService {

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;
    private final IntervalsApiClient intervalsApi;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final IntervalsActivityAnalysisService analysisService;
    private final IntervalsIntervalService intervalsIntervalService;

    public Map<String, Object> getActivityDetails(String username, String activityId) {
        Map<String, Object> details = new HashMap<>();
        Long uid = userService.getUserEntityByUsername(username).getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);

        // Garmin-connected: serve from the local mirror only — activity
        // data is never pulled from Intervals for these users. A mirror
        // miss (not yet imported) renders as "incomplete" in the UI.
        if (garminConnected) {
            var mirrorRow = intervalsActivityRepository.findByUserIdAndActivityId(uid, activityId);
            if (mirrorRow.isPresent()) {
                log.debug("SOURCE=DB user {} activity {} details served from local mirror", username, activityId);
                return mirrorActivityDetails(uid, activityId, mirrorRow.get());
            }
            details.put("incomplete", true);
            details.put("incompleteReason",
                    "This activity is not in the local mirror yet — run a backfill import to sync it.");
            return details;
        }

        ApiContext ctx = clientFactory.buildContext(userService, username);
        WebClient client = ctx.client;
        try {
            JsonNode activityNode = intervalsApi.getJson(client,
                    uriBuilder -> uriBuilder.path("/api/v1/activity/{id}")
                            .queryParam("intervals", "true").build(activityId));
            details.put("activity", activityNode);
        } catch (Exception e) {
            log.error("Failed to fetch activity {}: {}", activityId, e.getMessage(), e);
            details.put("activityError", e.getMessage());
        }

        try {
            JsonNode[] streamsNodeRef = new JsonNode[1];
            streamsNodeRef[0] = intervalsApi.getJson(client, "/api/v1/activity/{id}/streams", activityId);
            JsonNode streamsNode = streamsNodeRef[0];
            details.put("streams", streamsNode);
            
            // Log available streams for debugging and handle both formats
            List<String> availableStreams = new ArrayList<>();
            Map<String, JsonNode> streamsMap = new HashMap<>();
            
            if (streamsNodeRef[0].isObject()) {
                // Object format: {"velocity_smooth": [...], "distance": [...]}
                streamsNodeRef[0].fieldNames().forEachRemaining(field -> {
                    availableStreams.add(field);
                    streamsMap.put(field, streamsNodeRef[0].get(field));
                });
                log.debug("Streams object format for {} with fields: {}", activityId, availableStreams);
                com.sgen.service.garmin.GpsTrackTrimmer.trimNormalized(streamsNodeRef[0]);
            } else if (streamsNodeRef[0].isArray()) {
                // Array format: [{"type": "velocity", "data": [...]}, ...]
                log.debug("Streams array format for {} with {} elements", activityId, streamsNodeRef[0].size());
                for (JsonNode streamElement : streamsNodeRef[0]) {
                    String type = streamElement.path("type").asText("");
                    if (!type.isEmpty()) {
                        availableStreams.add(type);
                        // Store the data array directly
                        if (streamElement.has("data")) {
                            streamsMap.put(type, streamElement.get("data"));
                        }
                    }
                }
                log.debug("Available stream types in array: {}", availableStreams);
                
                // Create a wrapper object for the pace calculation to use
                ObjectNode streamsWrapper = objectMapper.createObjectNode();
                for (Map.Entry<String, JsonNode> entry : streamsMap.entrySet()) {
                    streamsWrapper.set(entry.getKey(), entry.getValue());
                }
                // Replace the array with our wrapper object for easier processing
                com.sgen.service.garmin.GpsTrackTrimmer.trimNormalized(streamsWrapper);
                details.put("streams", streamsWrapper);
                streamsNodeRef[0] = streamsWrapper;
            }
            
        } catch (Exception e) {
            log.warn("Failed to fetch streams for {}: {}", activityId, e.getMessage());
        }

        // Enrich intervals with start/end HR and HRR from streams (must run after streams are fetched)
        JsonNode activityNodeForIntervals = (JsonNode) details.get("activity");
        if (activityNodeForIntervals != null && activityNodeForIntervals.has("icu_intervals")) {
            JsonNode intervals = activityNodeForIntervals.get("icu_intervals");
            com.sgen.util.IntervalEnrichment.enrich(intervals, (JsonNode) details.get("streams"));
            details.put("intervalSummary", intervalsIntervalService.extractIntervalSummary(intervals));
            Map<String, Object> intervalsWrapper = new HashMap<>();
            intervalsWrapper.put("icu_intervals", intervals);
            details.put("intervals", intervalsWrapper);
        }

        try {
            details.put("powerCurve",
                    intervalsApi.getJson(client, "/api/v1/activity/{id}/power-curve", activityId));
        } catch (Exception e) {
            // The API only precomputes curves for power sports — for other
            // activity types (SkiErg, rowing, ...) the watts stream still has
            // the data, so compute the curve locally from the fetched streams.
            JsonNode streamsNode = (JsonNode) details.get("streams");
            JsonNode watts = streamsNode != null && streamsNode.isObject()
                    ? streamsNode.get("watts") : null;
            if (watts != null && watts.isArray() && watts.size() > 0) {
                details.put("powerCurve",
                        com.sgen.service.garmin.CurveCalculator.curve(watts));
                log.debug("Power curve for {} computed from watts stream (API had no precomputed curve)", activityId);
            } else {
                log.warn("Failed to fetch power curve for {}: {}", activityId, e.getMessage());
            }
        }

        // Fetch map data (latlngs for the map)
        try {
            String mapJson = intervalsApi.getString(client, "/api/v1/activity/{id}/map", activityId);
            if (mapJson != null && !mapJson.isEmpty()) {
                JsonNode mapData = objectMapper.readTree(mapJson);
                if (mapData instanceof com.fasterxml.jackson.databind.node.ObjectNode mo
                        && mo.get("latlngs") != null) {
                    com.sgen.service.garmin.GpsTrackTrimmer.trimLatlngs(mo.get("latlngs"));
                }
                details.put("mapData", mapData);
            }
        } catch (Exception e) {
            log.debug("No map data available for activity {}: {}", activityId, e.getMessage());
        }

        addPaceCurve(activityId, details, (JsonNode) details.get("streams"));

        return details;
    }

    /** Same details shape as the API path, built entirely from mirror rows. */
    private Map<String, Object> mirrorActivityDetails(Long uid, String activityId,
                                                      com.sgen.entity.IntervalsActivity row) {
        Map<String, Object> details = new HashMap<>();
        try {
            ObjectNode activity = (ObjectNode) objectMapper.readTree(row.getPayloadJson());
            details.put("activity", activity);
            var srow = intervalsStreamsRepository.findByUserIdAndActivityId(uid, activityId).orElse(null);
            JsonNode streams = null, intervals = null;
            if (srow != null) {
                try { if (srow.getStreamsJson() != null && !srow.getStreamsJson().isBlank())
                        streams = objectMapper.readTree(srow.getStreamsJson()); }
                catch (Exception e) { log.debug("mirror streams parse {}", e.getMessage()); }
                try { if (srow.getIntervalsJson() != null && !srow.getIntervalsJson().isBlank())
                        intervals = objectMapper.readTree(srow.getIntervalsJson()); }
                catch (Exception e) { log.debug("mirror intervals parse {}", e.getMessage()); }
                if (intervals != null && intervals.isObject() && intervals.has("icu_intervals"))
                    intervals = intervals.get("icu_intervals");
            }
            // No lazy Intervals healing — the backfill importer owns the mirror.
            ObjectNode normalized = normalizeStreams(streams);
            if (normalized != null) {
                com.sgen.service.garmin.GpsTrackTrimmer.trimNormalized(normalized);
                details.put("streams", normalized);
                details.put("powerCurve", com.sgen.service.garmin.CurveCalculator.curve(normalized.get("watts")));
                details.put("hrCurve", com.sgen.service.garmin.CurveCalculator.curve(normalized.get("heartrate")));
                // Map payload built locally from the latlng stream — same
                // shape the Intervals /map endpoint returns.
                ObjectNode map = localMapData(normalized);
                if (map.has("latlngs")) details.put("mapData", map);
            }
            if (intervals != null) {
                com.sgen.util.IntervalEnrichment.enrich(intervals, normalized);
                activity.set("icu_intervals", intervals);
                details.put("intervalSummary", intervalsIntervalService.extractIntervalSummary(intervals));
                details.put("intervals", Map.of("icu_intervals", intervals));
            }
            addPaceCurve(activityId, details, normalized);
        } catch (Exception e) {
            log.warn("Mirror details for {} failed: {}", activityId, e.getMessage());
        }
        return details;
    }

    /** Normalize Intervals streams (array [{type,data}] or object) to {type→data}. */
    private ObjectNode normalizeStreams(JsonNode streams) {
        return com.sgen.service.garmin.CurveCalculator.normalizeStreams(streams);
    }

    /** {latlngs: [[lat,lng],...]} from the latlng stream — the shape the
     *  frontend map renderer expects (Intervals /map payload format).
     *  Garmin stores pairs [[lat,lng],...]; Intervals /streams stores a flat
     *  [lat,lng,lat,lng,...] array — both are normalized to pairs here.
     *  Trimmed/invalid points are emitted as null (the renderer filters them). */
    private ObjectNode localMapData(ObjectNode normalized) {
        ObjectNode map = objectMapper.createObjectNode();
        if (!(normalized.get("latlng") instanceof com.fasterxml.jackson.databind.node.ArrayNode ll)
                || ll.size() < 2) return map;

        // Detect format from the first non-null element: an array means
        // pairs [[lat,lng],...], a number means flat [lat,lng,lat,lng,...].
        boolean flat = false;
        for (JsonNode el : ll) {
            if (el != null && el.isArray()) { flat = false; break; }
            if (el != null && el.isNumber()) { flat = true; break; }
        }
        if (flat) {
            var out = objectMapper.createArrayNode();
            int valid = 0;
            for (int i = 0; i + 1 < ll.size(); i += 2) {
                JsonNode lat = ll.get(i), lng = ll.get(i + 1);
                if (lat != null && lat.isNumber() && lng != null && lng.isNumber()) {
                    out.addArray().add(lat.asDouble()).add(lng.asDouble());
                    valid++;
                } else {
                    out.addNull();
                }
            }
            if (valid >= 2) map.set("latlngs", out);
            return map;
        }

        int valid = 0;
        for (JsonNode p : ll) {
            if (p != null && p.isArray() && p.size() >= 2
                    && p.get(0).isNumber() && p.get(1).isNumber()) valid++;
        }
        if (valid >= 2) map.set("latlngs", ll);
        return map;
    }

    /** Pace curve for running activities, shared by the API and mirror paths. */
    private void addPaceCurve(String activityId, Map<String, Object> details, JsonNode streamsNode) {
        try {
            JsonNode activityNode = (JsonNode) details.get("activity");
            if (activityNode == null || streamsNode == null) return;
            String type = activityNode.path("type").asText("");
            if (!com.sgen.util.PaceMath.isRunningActivity(type)) return;
            if (!(streamsNode.has("velocity_smooth") || streamsNode.has("distance")
                    || streamsNode.has("watts") || streamsNode.has("pace"))) return;
            Map<Integer, Double> paceCurve = calculatePaceFromStreams(streamsNode);
            if (paceCurve.isEmpty()) return;
            Map<String, Object> paceResult = new HashMap<>();
            paceResult.put("activityId", activityId);
            paceResult.put("activityName", activityNode.path("name").asText(""));
            String dateStr = activityNode.path("start_date_local").asText("");
            paceResult.put("activityDate", dateStr.length() >= 10 ? dateStr.substring(0, 10) : dateStr);
            paceResult.put("sportType", type);
            paceResult.put("paceData", paceCurve);
            paceResult.put("totalDistance", activityNode.path("distance").asDouble(0));
            paceResult.put("totalTime", activityNode.path("moving_time").asInt(0));
            details.put("paceCurve", paceResult);
        } catch (Exception e) {
            log.error("Failed to calculate pace curve for {}: {}", activityId, e.getMessage(), e);
        }
    }

    /**
     * Check if activity type is a running activity
     */


    private Map<Integer, Double> calculatePaceFromStreams(JsonNode streamsNode) {
        int[] durations = {30, 60, 120, 300, 600, 1200, 1800, 3600, 7200, 10800};
        if (streamsNode == null) return new LinkedHashMap<>();
        if (streamsNode.has("velocity_smooth")
                && streamsNode.get("velocity_smooth").isArray()
                && streamsNode.get("velocity_smooth").size() > 0) {
            return com.sgen.util.PaceMath.bestVelocityWindows(streamsNode.get("velocity_smooth"), durations);
        }
        if (streamsNode.has("distance")
                && streamsNode.get("distance").isArray()
                && streamsNode.get("distance").size() > 0) {
            return com.sgen.util.PaceMath.bestVelocityFromDistance(streamsNode.get("distance"), durations);
        }
        return new LinkedHashMap<>();
    }
    
    /**
     * Calculate pace from velocity_smooth stream
     */
    
    /**
     * Calculate pace from distance stream (fallback when velocity is not available)
     */


}
