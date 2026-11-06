package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.entity.GarminFileQueueItem;
import com.sgen.repository.GarminConnectionRepository;
import com.sgen.repository.GarminFileQueueItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDateTime;

/**
 * Handles activityFiles push items: queue the callbackURL and fetch the
 * raw file (FIT/TCX/GPX). URL is valid 24h and allows ONE download
 * (HTTP 410 on repeat). Phase 1 stores bytes; FIT parsing is phase 2.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminFileService {

    private final com.sgen.repository.UserRepository userRepository;
    private final com.sgen.service.UserLookupService userLookupService;
    private final GarminFileQueueItemRepository fileQueueRepository;
    private final GarminConnectionRepository connectionRepository;

    public void queue(JsonNode item) {
        String summaryId = item.path("summaryId").asText(null);
        if (summaryId == null || fileQueueRepository.existsBySummaryId(summaryId)) return;
        Long userId = connectionRepository.findByGarminUserId(item.path("userId").asText(null))
                .map(c -> c.getUserId()).orElse(null);
        GarminFileQueueItem q = GarminFileQueueItem.builder()
                .userId(userId)
                .summaryId(summaryId)
                .garminActivityId(item.path("activityId").asLong(0))
                .callbackUrl(item.path("callbackURL").asText(null))
                .fileType(item.path("fileType").asText(null))
                .status("PENDING")
                .urlExpiresAt(LocalDateTime.now().plusHours(23)) // 24h, margin
                .build();
        fileQueueRepository.save(q);
        fetch(q.getId());
    }

    public void fetch(Long queueItemId) {
        GarminFileQueueItem q = fileQueueRepository.findById(queueItemId).orElse(null);
        if (q == null || q.getCallbackUrl() == null) return;
        try {
            byte[] bytes = WebClient.create().get()
                    .uri(q.getCallbackUrl())
                    .retrieve().bodyToMono(byte[].class).block();
            q.setFitBytes(bytes);
            q.setStatus("FETCHED");
            q.setFetchedAt(LocalDateTime.now());
        } catch (Exception e) {
            q.setStatus("FAILED");
            q.setAttempts(q.getAttempts() + 1);
            q.setLastError(e.getMessage() != null
                    ? e.getMessage().substring(0, Math.min(1000, e.getMessage().length())) : "fetch failed");
            log.warn("Garmin file fetch failed for {}: {}", q.getSummaryId(), e.getMessage());
        }
        fileQueueRepository.save(q);
    }

}
