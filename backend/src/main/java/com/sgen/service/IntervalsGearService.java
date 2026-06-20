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

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final ObjectMapper objectMapper;
    private final GearMaintenanceService gearMaintenanceService;

    public JsonNode fetchGear(String username) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String json = ctx.client.get()
                    .uri("/api/v1/athlete/{id}/gear", ctx.user.getIntervalsAthleteId())
                    .retrieve().bodyToMono(String.class).block();
            return objectMapper.readTree(json);
        } catch (Exception e) {
            log.error("Failed to fetch gear: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch gear: " + e.getMessage());
        }
    }

    public JsonNode createGear(String username, Map<String, Object> gearData) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
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
        ApiContext ctx = clientFactory.buildContext(userService, username);
        try {
            String currentJson = ctx.client.get()
                    .uri("/api/v1/activity/{id}", activityId)
                    .retrieve().bodyToMono(String.class).block();
            JsonNode activityNode = objectMapper.readTree(currentJson);

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
}
