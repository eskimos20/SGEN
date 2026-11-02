package com.sgen.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.GarminPushItem;
import com.sgen.repository.GarminPushItemRepository;
import com.sgen.service.garmin.GarminPushProcessor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * Inbound Garmin PUSH notifications (all summary types, one endpoint per spec).
 * Contract: respond HTTP 200 within 30s BEFORE any processing; retries land
 * for 7 days on non-200. Auth: garmin-client-id header must match our app id.
 */
@RestController
@RequestMapping("/api/garmin")
@RequiredArgsConstructor
@Slf4j
public class GarminPushController {

    private final GarminPushItemRepository inboxRepository;
    private final GarminPushProcessor pushProcessor;
    private final ObjectMapper objectMapper;
    private final com.sgen.service.AppSettingsService appSettingsService;

    @Value("${garmin.client-id:}")
    private String clientId;

    @PostMapping("/push")
    public ResponseEntity<Void> receive(@RequestBody String body,
                                        @RequestHeader(value = "garmin-client-id", required = false) String headerClientId) {
        String expectedId = appSettingsService.getGarminClientId() != null
                ? appSettingsService.getGarminClientId() : clientId;
        if (expectedId == null || expectedId.isBlank() || !expectedId.equals(headerClientId)) {
            log.warn("Rejected Garmin push with bad client-id header");
            // Still 200 so Garmin does not retry-forever on config errors
            return ResponseEntity.ok().build();
        }

        List<Long> queuedIds = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(body);
            root.fields().forEachRemaining(entry -> {
                String type = entry.getKey();
                if (entry.getValue().isArray()) {
                    for (JsonNode item : entry.getValue()) {
                        Long id = queue(type, item);
                        if (id != null) queuedIds.add(id);
                    }
                }
            });
        } catch (Exception e) {
            log.error("Malformed Garmin push body: {}", e.getMessage());
        }

        if (!queuedIds.isEmpty()) {
            pushProcessor.processAsync(queuedIds);
        }
        return ResponseEntity.ok().build();
    }

    private Long queue(String type, JsonNode item) {
        String summaryId = item.path("summaryId").asText(null);
        if (summaryId == null) {
            String userId = item.path("userId").asText("nouser");
            summaryId = type + ":" + userId + ":" + Integer.toHexString(item.toString().hashCode());
        }
        if (inboxRepository.existsBySummaryTypeAndSummaryId(type, summaryId)) {
            return null; // duplicate delivery — Garmin sends these on retry
        }
        try {
            GarminPushItem saved = inboxRepository.save(GarminPushItem.builder()
                    .summaryType(type)
                    .summaryId(summaryId)
                    .payloadJson(item.toString())
                    .status("PENDING")
                    .build());
            return saved.getId();
        } catch (DataIntegrityViolationException e) {
            return null; // race on unique(summary_type, summary_id)
        }
    }
}
