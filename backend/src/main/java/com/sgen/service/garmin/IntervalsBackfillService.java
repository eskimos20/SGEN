package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.service.IntervalsClientFactory;
import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.repository.GarminActivityRepository;
import com.sgen.repository.UserDailyLoadRepository;
import com.sgen.service.UserService;
import com.sgen.util.IntervalsApiRateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * One-time historical backfill: walks Intervals.icu activity history
 * backwards year by year and persists icu_training_load per day into
 * user_daily_load (source INTERVALS). Runs async via the shared
 * IntervalsApiRateLimiter so we never stress their API (25 req/s,
 * 100 req/10s ceilings, plus an extra politeness pause per year chunk).
 * Idempotent (upserts) — safe to re-run.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsBackfillService {

    private final IntervalsClientFactory clientFactory;
    private final FitnessModelService fitnessModelService;
    private final UserService userService;
    private final IntervalsApiRateLimiter rateLimiter;
    private final ObjectMapper objectMapper;
    private final UserDailyLoadRepository dailyLoadRepository;
    private final GarminActivityRepository garminActivityRepository;

    private static final int MAX_YEARS_BACK = 15;
    private static final long CHUNK_PAUSE_MS = 1_500;

    /** username -> progress state */
    private final Map<String, BackfillStatus> status = new ConcurrentHashMap<>();

    public record BackfillStatus(String state, int yearsDone, int totalActivities, String error) {}

    /**
     * Progress for the running job + persisted import stats, so the UI can
     * always show the synced badge — even after restarts and new sessions.
     */
    public Map<String, Object> getStatus(String username) {
        BackfillStatus s = status.get(username);
        Long userId = userService.getUserEntityByUsername(username).getId();
        long imported = safeSum(dailyLoadRepository.sumActivityCount(userId, "INTERVALS"));
        long garminCount = garminActivityRepository.countByUserId(userId);
        var out = new java.util.HashMap<String, Object>();
        out.put("state", s != null ? s.state() : "IDLE");
        out.put("yearsDone", s != null ? s.yearsDone() : 0);
        out.put("totalActivities", s != null ? s.totalActivities() : 0);
        out.put("error", s != null && s.error() != null ? s.error() : "");
        out.put("importedActivities", imported);
        out.put("garminActivities", garminCount);
        return out;
    }

    private long safeSum(Long v) { return v != null ? v : 0; }

    /** Kick off async backfill; returns immediately. */
    public void startAsync(String username) {
        BackfillStatus cur = status.get(username);
        if (cur != null && "RUNNING".equals(cur.state())) return;
        status.put(username, new BackfillStatus("RUNNING", 0, 0, null));
        runAsync(username);
    }

    @Async
    public void runAsync(String username) {
        AtomicInteger total = new AtomicInteger();
        try {
            ApiContext ctx = clientFactory.buildContext(userService, username);
            String athleteId = ctx.user.getIntervalsAthleteId();
            WebClient client = ctx.client;

            LocalDate newest = LocalDate.now();
            int years = 0;
            for (; years < MAX_YEARS_BACK; years++) {
                LocalDate oldest = newest.minusYears(1).plusDays(1);
                final LocalDate fNewest = newest;
                try {
                    rateLimiter.acquire();
                    String json = client.get()
                            .uri(b -> b.path("/api/v1/athlete/{id}/activities")
                                    .queryParam("oldest", oldest)
                                    .queryParam("newest", fNewest)
                                    .build(athleteId))
                            .retrieve().bodyToMono(String.class).block();
                    JsonNode acts = objectMapper.readTree(json);
                    if (!acts.isArray() || acts.isEmpty()) break;
                    fitnessModelService.recordIntervalsLoads(ctx.user.getId(), acts, false);
                    total.addAndGet(acts.size());
                    int done = years + 1;
                    status.put(username, new BackfillStatus("RUNNING", done, total.get(), null));
                    log.info("Backfill {}-{}: {} activities (total {})", oldest, fNewest, acts.size(), total.get());
                    Thread.sleep(CHUNK_PAUSE_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (Exception e) {
                    log.warn("Backfill chunk {}-{} failed: {}", oldest, fNewest, e.getMessage());
                }
                newest = oldest.minusDays(1);
            }
            fitnessModelService.recompute(ctx.user.getId());
            status.put(username, new BackfillStatus("DONE", years, total.get(), null));
        } catch (Exception e) {
            log.error("Backfill failed for {}: {}", username, e.getMessage());
            status.put(username, new BackfillStatus("ERROR", 0, total.get(), e.getMessage()));
        }
    }
}
