package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.ActivityAnalysis;
import com.sgen.entity.IntervalsActivity;
import com.sgen.entity.User;
import com.sgen.repository.ActivityAnalysisRepository;
import com.sgen.repository.IntervalsActivityRepository;
import com.sgen.repository.UserRepository;
import com.sgen.service.garmin.IntervalsMirrorService;
import com.sgen.service.garmin.StreamsPersistedEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Per-activity power analysis. Each activity is analyzed exactly once —
 * when its streams are persisted (StreamsPersistedEvent) or when the
 * statistics path first encounters it — and the result is stored in
 * activity_analysis. Analyzed activities are never re-processed;
 * statistics reads consume the FTP/VO2 top-3 tables that this service
 * feeds via PerformanceService.
 */
@Service
@Slf4j
public class ActivityAnalysisService {

    private final ActivityAnalysisRepository analysisRepository;
    private final IntervalsActivityRepository activityRepository;
    private final IntervalsMirrorService mirrorService;
    private final IntervalsActivityAnalysisService analysisService;
    private final PerformanceService performanceService;
    private final LocalAchievementDetectionService detectionService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public ActivityAnalysisService(ActivityAnalysisRepository analysisRepository,
                                   IntervalsActivityRepository activityRepository,
                                   IntervalsMirrorService mirrorService,
                                   IntervalsActivityAnalysisService analysisService,
                                   PerformanceService performanceService,
                                   LocalAchievementDetectionService detectionService,
                                   UserRepository userRepository,
                                   ObjectMapper objectMapper) {
        this.analysisRepository = analysisRepository;
        this.activityRepository = activityRepository;
        this.mirrorService = mirrorService;
        this.analysisService = analysisService;
        this.performanceService = performanceService;
        this.detectionService = detectionService;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "activity-analysis");
        t.setDaemon(true);
        return t;
    });

    private final java.util.concurrent.ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "activity-analysis-scheduler");
                t.setDaemon(true);
                return t;
            });

    /**
     * Scheduled sweep: 30s after startup and every hour, walk all mirrored
     * activities for every user and analyze any that lack an analysis row.
     * Work is handed to the single analysis executor so event-triggered and
     * sweep-triggered analyses never run concurrently.
     */
    @jakarta.annotation.PostConstruct
    void startSweep() {
        scheduler.scheduleWithFixedDelay(
                () -> executor.submit(this::sweepAllUsers), 30, 3600, TimeUnit.SECONDS);
    }

    void sweepAllUsers() {
        try {
            int totalQueued = 0;
            for (Long userId : activityRepository.findDistinctUserIds()) {
                Set<String> done = analysisRepository.findActivityIdsByUserId(userId);
                List<String> ids = activityRepository.findActivityIdsByUserIdOrderByDate(userId);
                int queued = 0;
                for (String activityId : ids) {
                    if (done.contains(activityId)) continue;
                    analyzeFromMirror(userId, activityId, false);
                    queued++;
                }
                totalQueued += queued;
                if (queued > 0) {
                    String username = userRepository.findById(userId)
                            .map(User::getUsername).orElse("id " + userId);
                    log.info("Analysis sweep analyzed {} activities for user \"{}\"", queued, username);
                }
            }
            if (totalQueued > 0) {
                log.info("Analysis sweep completed: {} activities analyzed", totalQueued);
            }
        } catch (Exception e) {
            log.debug("Analysis sweep failed: {}", e.getMessage());
        }
    }

    /** All activity ids already analyzed — used to skip them at read time. */
    public Set<String> findAnalyzedIds(Long userId) {
        return analysisRepository.findActivityIdsByUserId(userId);
    }

    /**
     * Queue a batch of analysis work on the background thread. The
     * statistics path submits unanalyzed activities here so a large
     * first-run backlog never blocks the user's request.
     */
    public void submit(Runnable task) {
        executor.submit(task);
    }

    /**
     * Streams were persisted to the mirror — queue the one-time analysis.
     * Runs on a dedicated single thread so backfill bursts stay sequential
     * and never block the request that stored the streams.
     */
    @EventListener
    public void onStreamsPersisted(StreamsPersistedEvent event) {
        executor.submit(() -> analyzeFromMirror(event.getUserId(), event.getActivityId(), false));
    }

    /**
     * Analyze a mirrored activity: read its stored streams, find the best
     * 5-minute power window, write the analysis row and feed the top-3
     * tables. Does nothing if a row already exists or no streams are stored.
     */
    void analyzeFromMirror(Long userId, String activityId, boolean retried) {
        try {
            var existing = analysisRepository.findByUserIdAndActivityId(userId, activityId).orElse(null);
            // Rows analyzed before best-windows existed get the windows
            // filled on the next pass — never a full re-analysis.
            if (existing != null && existing.getBestWindowsJson() != null) return;

            String streamsJson = mirrorService.findStreamsJson(userId, activityId);
            if (streamsJson == null || streamsJson.isBlank()) return;
            JsonNode streams = objectMapper.readTree(streamsJson);

            var act = activityRepository.findByUserIdAndActivityId(userId, activityId).orElse(null);
            if (act == null) {
                // Activity payload may not be merged yet during backfill —
                // retry once, then let the statistics path pick it up.
                if (!retried) {
                    executor.execute(() -> {
                        try { Thread.sleep(5000); } catch (InterruptedException ignored) {}
                        analyzeFromMirror(userId, activityId, true);
                    });
                }
                return;
            }

            JsonNode payload = objectMapper.readTree(act.getPayloadJson());
            String name = payload.path("name").asText("");
            String type = payload.path("type").asText("");
            String dateStr = payload.path("start_date_local").asText("");
            LocalDate date = dateStr.length() >= 10 ? LocalDate.parse(dateStr.substring(0, 10)) : null;
            boolean indoor = payload.path("trainer").asBoolean(false) || type.startsWith("Virtual");
            double weightKg = weightFromAthleteDoc(userId);

            JsonNode windows = detectionService.computeWindows(streams);
            String windowsJson = objectMapper.writeValueAsString(windows);

            if (existing != null) {
                existing.setBestWindowsJson(windowsJson);
                analysisRepository.save(existing);
                detectionService.detect(userId, activityId, payload, windows, name, type, date, indoor);
                return;
            }

            double best5 = analysisService.findBest5MinWindow(streams);
            if (best5 <= 0) {
                saveRow(userId, activityId, "NO_DATA", null, name, type, date, indoor, weightKg, windowsJson);
            } else {
                saveRow(userId, activityId, "COMPLETED", best5, name, type, date, indoor, weightKg, windowsJson);
                feedTop3(userId, activityId, name, type, date, indoor, weightKg, best5);
            }
            detectionService.detect(userId, activityId, payload, windows, name, type, date, indoor);
        } catch (Exception e) {
            log.debug("Activity analysis failed for {}: {}", activityId, e.getMessage());
        }
    }

    /**
     * Record an externally computed result (statistics path, where streams
     * may come from the Intervals API for non-mirrored users) so the
     * activity is never re-analyzed.
     */
    public void recordResult(Long userId, String username, String activityId, String name,
                             String type, LocalDate date, boolean indoor, double weightKg,
                             double best5minAvg) {
        try {
            if (analysisRepository.existsByUserIdAndActivityId(userId, activityId)) return;
            if (best5minAvg <= 0) {
                saveRow(userId, activityId, "NO_DATA", null, name, type, date, indoor, weightKg);
                return;
            }
            saveRow(userId, activityId, "COMPLETED", best5minAvg, name, type, date, indoor, weightKg);
            feedTop3(userId, activityId, name, type, date, indoor, weightKg, best5minAvg);
        } catch (Exception e) {
            log.debug("Recording analysis for {} failed: {}", activityId, e.getMessage());
        }
    }

    /** Mark an activity that has no usable power data so it is never retried. */
    public void recordNoData(Long userId, String activityId, String name, String type,
                             LocalDate date, boolean indoor, double weightKg) {
        recordResult(userId, null, activityId, name, type, date, indoor, weightKg, 0);
    }

    private void feedTop3(Long userId, String activityId, String name, String type,
                          LocalDate date, boolean indoor, double weightKg, double best5minAvg) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return;
        String username = user.getUsername();
        performanceService.updateFtpIfBetter(username, activityId, name, type, date, best5minAvg, indoor);
        if (weightKg > 0) {
            performanceService.updateVo2MaxIfBetter(username, activityId, name, type, date,
                    weightKg, best5minAvg, indoor);
        }
    }

    private double weightFromAthleteDoc(Long userId) {
        try {
            JsonNode athlete = mirrorService.getDoc(userId, "athlete");
            if (athlete == null) return 0;
            double w = athlete.path("icu_weight").asDouble(0);
            return w > 0 ? w : athlete.path("weight").asDouble(0);
        } catch (Exception e) {
            return 0;
        }
    }

    private void saveRow(Long userId, String activityId, String status, Double best5minAvg,
                         String name, String type, LocalDate date, boolean indoor, double weightKg) {
        saveRow(userId, activityId, status, best5minAvg, name, type, date, indoor, weightKg, null);
    }

    private void saveRow(Long userId, String activityId, String status, Double best5minAvg,
                         String name, String type, LocalDate date, boolean indoor, double weightKg,
                         String bestWindowsJson) {
        analysisRepository.save(ActivityAnalysis.builder()
                .userId(userId)
                .activityId(activityId)
                .status(status)
                .best5minAvg(best5minAvg)
                .activityName(name)
                .activityType(type)
                .activityDate(date)
                .indoor(indoor)
                .weightKg(weightKg)
                .bestWindowsJson(bestWindowsJson)
                .build());
    }
}
