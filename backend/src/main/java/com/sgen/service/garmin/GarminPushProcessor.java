package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.GarminPushItem;
import com.sgen.repository.GarminConnectionRepository;
import com.sgen.repository.GarminPushItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Async dispatcher for garmin_push_inbox items. Each item is processed
 * idempotently by type; updated summaries overwrite previous records
 * (per spec: latest summary wins, same userId+startTime+type).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminPushProcessor {

    private final com.sgen.repository.UserRepository userRepository;
    private final com.sgen.service.UserLookupService userLookupService;
    private final GarminPushItemRepository inboxRepository;
    private final GarminConnectionRepository connectionRepository;
    private final GarminActivityMapper activityMapper;
    private final GarminWellnessMapper wellnessMapper;
    private final GarminFileService fileService;
    private final GarminOAuthService oauthService;
    private final GarminDataCleanupService cleanupService;
    private final ObjectMapper objectMapper;

    private static final Set<String> ACTIVITY_TYPES = Set.of(
            "activities", "manuallyUpdatedActivities", "moveIQActivities");
    private static final Set<String> WELLNESS_TYPES = Set.of(
            "dailies", "epochs", "sleeps", "bodyComps", "stressDetails", "userMetrics",
            "pulseox", "allDayRespiration", "healthSnapshot", "hrv", "bloodPressures",
            "skinTemp", "nutrition", "hydration", "breathingVariations", "respiration");

    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    @Async
    public void processAsync(List<Long> ids) {
        for (Long id : ids) {
            executor.submit(() -> processSafe(id));
        }
    }

    /** Sweeper: retries FAILED/PENDING items (backstop if async died pre-commit). */
    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public void sweep() {
        for (GarminPushItem item : inboxRepository.findTop50ByStatusOrderByReceivedAtAsc("PENDING")) {
            executor.submit(() -> processSafe(item.getId()));
        }
        for (GarminPushItem item : inboxRepository.findTop50ByStatusOrderByReceivedAtAsc("FAILED")) {
            if (item.getAttempts() < 24) { // ~1/day via sweeper cadence
                executor.submit(() -> processSafe(item.getId()));
            }
        }
        oauthService.refreshExpiringTokens();
        oauthService.refetchMissingPermissions();
    }

    private void processSafe(Long id) {
        GarminPushItem item = inboxRepository.findById(id).orElse(null);
        if (item == null || "PROCESSED".equals(item.getStatus()) || "DUPLICATE".equals(item.getStatus())) {
            return;
        }
        try {
            item.setStatus("PROCESSING");
            item.setAttempts(item.getAttempts() + 1);
            inboxRepository.save(item);

            JsonNode payload = objectMapper.readTree(item.getPayloadJson());
            dispatch(item.getSummaryType(), payload);

            item.setStatus("PROCESSED");
            item.setProcessedAt(LocalDateTime.now());
            inboxRepository.save(item);
        } catch (Exception e) {
            log.error("Garmin push item {} ({}) failed: {}", id, item.getSummaryType(), e.getMessage());
            item.setStatus("FAILED");
            item.setLastError(e.getMessage() != null ? e.getMessage().substring(0, Math.min(1000, e.getMessage().length())) : "unknown");
            inboxRepository.save(item);
        }
    }

    private void dispatch(String type, JsonNode payload) {
        if (ACTIVITY_TYPES.contains(type)) {
            activityMapper.mapSummary(type, payload);
        } else if ("activityDetails".equals(type)) {
            activityMapper.mapDetails(payload);
        } else if ("activityFiles".equals(type)) {
            fileService.queue(payload);
        } else if (WELLNESS_TYPES.contains(type)) {
            wellnessMapper.map(type, payload);
        } else if ("deregistrations".equals(type)) {
            Long userId = oauthService.handleDeregistration(payload.path("userId").asText());
            if (userId != null) cleanupService.deleteAllGarminData(userId);
        } else if ("userPermissionsChange".equals(type)) {
            handlePermissionsChange(payload);
        } else {
            log.debug("Ignoring unhandled Garmin summary type: {}", type);
        }
    }

    private void handlePermissionsChange(JsonNode payload) {
        String garminUserId = payload.path("userId").asText(null);
        if (garminUserId == null) return;
        connectionRepository.findByGarminUserId(garminUserId).ifPresent(conn -> {
            StringBuilder perms = new StringBuilder();
            payload.path("permissions").forEach(p -> {
                if (perms.length() > 0) perms.append(',');
                perms.append(p.asText());
            });
            conn.setScopes(perms.toString());
            // Empty permission list = user turned off all sharing in Garmin Connect
            if (perms.length() == 0) {
                conn.setStatus("NEEDS_REAUTH");
            }
            connectionRepository.save(conn);
        });
    }

}
