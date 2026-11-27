package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsGearService {

    private final com.sgen.service.IntervalsApiClient intervalsApi;
    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final GearMaintenanceService gearMaintenanceService;
    private final com.sgen.repository.GarminActivityRepository garminActivityRepository;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.service.garmin.GarminMergeService garminMergeService;
    private final com.sgen.service.garmin.GarminClientFactory garminClientFactory;
    private final com.sgen.util.IntervalsApiRateLimiter rateLimiter;

    public JsonNode fetchGear(String username) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = intervalsApi.getString(ctx.client, "/api/v1/athlete/{id}/gear", ctx.user.getIntervalsAthleteId());
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch gear: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch gear: " + e.getMessage());
        }
    }

    public JsonNode createGear(String username, Map<String, Object> gearData) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
            String json = ctx.client.post()
                    .uri("/api/v1/athlete/{id}/gear", ctx.user.getIntervalsAthleteId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(gearData)
                    .retrieve().bodyToMono(String.class).block();
            log.info("Created gear for user {}: {}", username, gearData.get("name"));
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to create gear: {}", e.getMessage());
            throw new RuntimeException("Failed to create gear: " + e.getMessage());
        }
    }

    public JsonNode updateGear(String username, String gearId, Map<String, Object> gearData) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
            String json = ctx.client.put()
                    .uri("/api/v1/athlete/{id}/gear/{gearId}", ctx.user.getIntervalsAthleteId(), gearId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(gearData)
                    .retrieve().bodyToMono(String.class).block();
            log.info("Updated gear {} for user {}", gearId, username);
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to update gear {}: {}", gearId, e.getMessage());
            throw new RuntimeException("Failed to update gear: " + e.getMessage());
        }
    }

    public void deleteGear(String username, String gearId) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            rateLimiter.acquire();
            ctx.client.delete()
                    .uri("/api/v1/athlete/{id}/gear/{gearId}", ctx.user.getIntervalsAthleteId(), gearId)
                    .retrieve().bodyToMono(Void.class).block();
            log.info("Deleted gear {} from Intervals.icu for user {}", gearId, username);
        } catch (WebClientResponseException.NotFound e) {
            log.info("Gear {} not found in Intervals.icu, deleting maintenance records only", gearId);
        } catch (Exception e) {
            log.error("Failed to delete gear {} from Intervals.icu: {}", gearId, e.getMessage());
            throw new RuntimeException("Failed to delete gear: " + e.getMessage());
        }
        gearMaintenanceService.deleteByGearId(gearId);
        log.info("Deleted maintenance records for gear {} for user {}", gearId, username);
    }

    public JsonNode updateActivityGear(String username, String activityId, String gearId) {
        // garmin_ ids exist only locally — gear is set on the uploaded
        // Intervals copy via the stored upstream link (or a timestamp match).
        if (activityId != null && activityId.startsWith("garmin_")) {
            return updateLocalActivityGear(username, activityId, gearId);
        }
        Long uid = userService.getUserEntityByUsername(username).getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);
        JsonNode activityNode = null;
        if (garminConnected) {
            // Fields for the update PUT come from the mirror — activity data
            // is never fetched from Intervals for Garmin-connected users.
            var mirrorRow = intervalsActivityRepository.findByUserIdAndActivityId(uid, activityId);
            if (mirrorRow.isEmpty()) {
                throw new RuntimeException(
                        "Activity is not in the local mirror — gear cannot be assigned yet");
            }
            try {
                activityNode = objectMapper.readTree(mirrorRow.get().getPayloadJson());
            } catch (Exception e) {
                throw new RuntimeException("Failed to read local activity: " + e.getMessage());
            }
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            if (activityNode == null) {
                String currentJson = intervalsApi.getString(ctx.client, "/api/v1/activity/{id}", activityId);
                activityNode = objectMapper.readTree(currentJson);
            }

            log.info("Original activity type: {}, source: {}",
                    activityNode.has("type") ? activityNode.get("type").asText() : "unknown",
                    activityNode.has("source") ? activityNode.get("source").asText() : "unknown");

            Map<String, Object> updateData = new HashMap<>();
            updateData.put("name", activityNode.has("name") && !activityNode.get("name").isNull()
                    ? activityNode.get("name").asText() : "");
            updateData.put("description", activityNode.has("description") && !activityNode.get("description").isNull()
                    ? activityNode.get("description").asText() : "");
            updateData.put("type", activityNode.has("type") && !activityNode.get("type").isNull()
                    ? activityNode.get("type").asText() : "Ride");
            updateData.put("sub_type", activityNode.has("sub_type") && !activityNode.get("sub_type").isNull()
                    ? activityNode.get("sub_type").asText() : "NONE");
            if (activityNode.has("trainer") && !activityNode.get("trainer").isNull()) {
                updateData.put("trainer", activityNode.get("trainer").asBoolean());
            } else {
                updateData.put("trainer", null);
            }
            Map<String, String> gearObj = new HashMap<>();
            gearObj.put("id", gearId);
            updateData.put("gear", gearObj);

            log.info("Sending activity update with gear id: {}", gearId);
            log.info("Update payload: {}", objectMapper.writeValueAsString(updateData));

            rateLimiter.acquire();
            String updatedJson = ctx.client.put()
                    .uri("/api/v1/activity/{id}", activityId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(updateData)
                    .retrieve().bodyToMono(String.class).block();
            log.info("Updated gear for activity {} to gear {} for user {}", activityId, gearId, username);
            return objectMapper.readTree(updatedJson);
        } catch (Exception e) {
            log.error("Failed to update activity {} gear: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to update activity gear: " + e.getMessage());
        }
    }

    /**
     * Gear assignment for a garmin_ activity: resolves the Intervals copy via
     * the stored link (or the same timestamp/duration heuristic the merge
     * uses), then PUTs the gear field built from the local activity — the
     * upstream GET to fetch current fields is not needed.
     */
    private JsonNode updateLocalActivityGear(String username, String activityId, String gearId) {
        Long uid = userService.getUserEntityByUsername(username).getId();
        Long gid = Long.parseLong(activityId.substring("garmin_".length()));
        var act = garminActivityRepository.findById(gid)
                .orElseThrow(() -> new RuntimeException("Garmin activity not found: " + activityId));
        if (!act.getUserId().equals(uid)) {
            throw new RuntimeException("Activity does not belong to user");
        }
        String upstreamId = act.getIntervalsActivityId();
        if (upstreamId == null || upstreamId.isBlank()) {
            if (act.getStartDateLocal() != null) {
                var day = act.getStartDateLocal().toLocalDate();
                for (var row : intervalsActivityRepository
                        .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(
                                uid, day.atStartOfDay(), day.plusDays(1).atStartOfDay())) {
                    try {
                        JsonNode payload = objectMapper.readTree(row.getPayloadJson());
                        if (garminMergeService.isDuplicateOfLocal(java.util.List.of(act), payload)) {
                            upstreamId = row.getActivityId();
                            act.setIntervalsActivityId(upstreamId);
                            garminActivityRepository.save(act);
                            break;
                        }
                    } catch (Exception ignored) {}
                }
            }
        }
        if (upstreamId == null || upstreamId.isBlank()) {
            throw new RuntimeException(
                    "Activity is not synced to Intervals.icu — gear cannot be assigned yet");
        }
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            Map<String, Object> updateData = new HashMap<>();
            updateData.put("name", act.getName() != null ? act.getName() : "");
            updateData.put("description", act.getDescription() != null ? act.getDescription() : "");
            updateData.put("type", garminMergeService.intervalsTypeFor(act));
            updateData.put("sub_type", "NONE");
            updateData.put("trainer", null);
            Map<String, String> gearObj = new HashMap<>();
            gearObj.put("id", gearId);
            updateData.put("gear", gearObj);
            rateLimiter.acquire();
            String updatedJson = ctx.client.put()
                    .uri("/api/v1/activity/{id}", upstreamId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(updateData)
                    .retrieve().bodyToMono(String.class).block();
            log.info("Updated gear for garmin activity {} (upstream {}) to {} for user {}",
                    activityId, upstreamId, gearId, username);
            return objectMapper.readTree(updatedJson);
        } catch (Exception e) {
            log.error("Failed to update garmin activity {} gear: {}", activityId, e.getMessage());
            throw new RuntimeException("Failed to update activity gear: " + e.getMessage());
        }
    }
}
