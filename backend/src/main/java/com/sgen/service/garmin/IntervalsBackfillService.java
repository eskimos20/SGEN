package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * One-time historical backfill: walks Intervals.icu activity history
 * backwards year by year and persists icu_training_load per day into
 * user_daily_load (source INTERVALS). Idempotent (upserts). This gives
 * the local CTL/ATL model full history before Garmin's Intervals
 * integration is cut — after that, INTERVALS rows stop growing for
 * Garmin data and GARMIN rows take over.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsBackfillService {

    private final IntervalsClientFactory clientFactory;
    private final FitnessModelService fitnessModelService;
    private final UserService userService;
    private final ObjectMapper objectMapper;

    private static final int MAX_YEARS_BACK = 15;

    /** Synchronous backfill; returns per-year activity counts. */
    public Map<String, Object> backfill(String username) {
        ApiContext ctx = clientFactory.buildContext(userService, username);
        String athleteId = ctx.user.getIntervalsAthleteId();
        WebClient client = ctx.client;

        Map<String, Integer> years = new HashMap<>();
        LocalDate newest = LocalDate.now();
        for (int i = 0; i < MAX_YEARS_BACK; i++) {
            LocalDate oldest = newest.minusYears(1).plusDays(1);
            final LocalDate fNewest = newest;
            try {
                String json = client.get()
                        .uri(b -> b.path("/api/v1/athlete/{id}/activities")
                                .queryParam("oldest", oldest)
                                .queryParam("newest", fNewest)
                                .build(athleteId))
                        .retrieve().bodyToMono(String.class).block();
                JsonNode acts = objectMapper.readTree(json);
                if (!acts.isArray() || acts.isEmpty()) break; // no earlier history
                fitnessModelService.recordIntervalsLoads(ctx.user.getId(), acts, false);
                years.put(String.valueOf(oldest.getYear()), acts.size());
                log.info("Backfilled {} activities {}-{}", acts.size(), oldest, newest);
            } catch (Exception e) {
                log.warn("Backfill chunk {}-{} failed: {}", oldest, newest, e.getMessage());
            }
            newest = oldest.minusDays(1);
        }
        fitnessModelService.recompute(ctx.user.getId());
        return Map.of("yearsProcessed", years.size(), "activities", years);
    }
}
