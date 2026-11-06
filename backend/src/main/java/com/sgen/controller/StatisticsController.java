package com.sgen.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.UserVersion;
import com.sgen.service.AIUsageService;
import com.sgen.service.AchievementNotificationService;
import com.sgen.service.CalendarEventService;
import com.sgen.service.IntervalsService;
import com.sgen.service.OpenAIService;
import com.sgen.service.PaceCurveService;
import com.sgen.service.PerformanceService;
import com.sgen.service.UserService;
import com.sgen.service.UserVersionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.sgen.service.UserService;
import com.sgen.service.garmin.GarminActivityViewService;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class StatisticsController {

    @Value("${app.version:unknown}")
    private String appVersion;

    private final IntervalsService intervalsService;
    private final OpenAIService openAIService;
    private final AIUsageService aiUsageService;
    private final ObjectMapper objectMapper;
    private final PerformanceService performanceService;
    private final GarminActivityViewService garminActivityViewService;
    private final com.sgen.service.garmin.IntervalsBackfillService backfillService;
    private final UserService userService;
    private final CalendarEventService calendarEventService;
    private final UserVersionService userVersionService;
    private final AchievementNotificationService achievementNotificationService;
    private final IntervalsControllerSupport support;
    private final PaceCurveService paceCurveService;

    /**
     * One-time Intervals history backfill -> user_daily_load (local CTL/ATL).
     * Async: returns 202 immediately, poll /backfill-loads/status for progress.
     */
    @PostMapping("/backfill-loads")
    public ResponseEntity<?> backfillLoads(Authentication authentication) {
        backfillService.startAsync(authentication.getName());
        return ResponseEntity.accepted().body(Map.of("state", "RUNNING"));
    }

    @GetMapping("/backfill-loads/status")
    public ResponseEntity<?> backfillStatus(Authentication authentication) {
        return ResponseEntity.ok(backfillService.getStatus(authentication.getName()));
    }

    @GetMapping("/fetch")
    public ResponseEntity<Map<String, Object>> fetchStatistics(
            @RequestParam(required = false) String analyze,
            Authentication authentication,
            @RequestParam(required = false) String oldest,
            @RequestParam(required = false) String newest,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {

        String start = oldest != null ? oldest : startDate;
        String end = newest != null ? newest : endDate;

        if (start == null || end == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing date parameters"));
        }
        if (start.compareTo(end) > 0) { String tmp = start; start = end; end = tmp; }

        Map<String, Object> data = intervalsService.fetchAllData(authentication.getName(), start, end,
                "true".equals(analyze));

        try {
            List<Map<String, Object>> eventsWithDeload = calendarEventService
                    .getCalendarEventsWithDeloadStatus(authentication.getName(), start, end);
            data.put("events", eventsWithDeload);
        } catch (Exception e) {
            log.warn("Failed to merge deload status into statistics events for user {}: {}", authentication.getName(), e.getMessage());
        }

        data.put("top3Ftp", performanceService.getTop3Ftp(authentication.getName()));
        data.put("top3Vo2Max", performanceService.getTop3Vo2Max(authentication.getName()));
        return ResponseEntity.ok(data);
    }

    @GetMapping("/activity/{activityId}")
    public ResponseEntity<Map<String, Object>> getActivityDetails(
            Authentication authentication,
            @PathVariable String activityId) {
        if (activityId != null && activityId.startsWith("garmin_")) {
            Long uid = userService.getUserEntityByUsername(authentication.getName()).getId();
            Long gid = Long.parseLong(activityId.substring(7));
            return ResponseEntity.ok(garminActivityViewService.getDetails(uid, gid));
        }
        return ResponseEntity.ok(intervalsService.getActivityDetails(authentication.getName(), activityId));
    }

    @GetMapping("/activity/{activityId}/map.png")
    public ResponseEntity<byte[]> getActivityMapImage(
            Authentication authentication,
            @PathVariable String activityId) {
        byte[] image = intervalsService.getActivityMapImage(authentication.getName(), activityId);
        if (image == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(image);
    }

    @GetMapping("/activity/{activityId}/chart.png")
    public ResponseEntity<byte[]> getActivityChartImage(
            Authentication authentication,
            @PathVariable String activityId) {
        byte[] image = intervalsService.getActivityChartImage(authentication.getName(), activityId);
        if (image == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(image);
    }

    @GetMapping("/power-curve-history")
    public ResponseEntity<JsonNode> getPowerCurveHistory(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest,
            @RequestParam(required = false, defaultValue = "Ride") String type) {
        return support.respondJson(() -> intervalsService.getPowerCurveHistory(
                authentication.getName(), oldest, newest, type),
                "Failed to fetch power curve history");
    }

    @GetMapping("/training-totals")
    public ResponseEntity<JsonNode> getTrainingTotals(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        return support.respondJson(() -> intervalsService.getTrainingTotalsActivities(
                authentication.getName(), oldest, newest),
                "Failed to fetch training totals");
    }

    @GetMapping("/openai-status")
    public ResponseEntity<Map<String, Object>> getOpenAIStatus(Authentication authentication) {
        var user = userService.getCurrentUser(authentication.getName());
        boolean configured = user.getOpenaiEnabled() != null && user.getOpenaiEnabled()
                && user.getOpenaiConnectionTested() != null && user.getOpenaiConnectionTested()
                && user.getOpenaiModel() != null;
        return ResponseEntity.ok(Map.of(
                "configured", configured,
                "activeProvider", configured ? "openai" : "none"
        ));
    }

    @PostMapping("/analyze")
    public ResponseEntity<Map<String, String>> analyzeWithAI(
            Authentication authentication,
            @RequestBody Map<String, Object> request) {
        return support.respond(() -> {
            try {
                String prompt = (String) request.get("prompt");
                @SuppressWarnings("unchecked")
                Map<String, Object> requestData = (Map<String, Object>) request.get("data");
                @SuppressWarnings("unchecked")
                List<Map<String, String>> conversationHistory = (List<Map<String, String>>) request.get("conversationHistory");
                String data = objectMapper.writeValueAsString(requestData);
                String analysis = openAIService.analyzeWithAI(authentication.getName(), prompt, data, conversationHistory);
                return Map.of("analysis", analysis);
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException("Failed to serialize request data", e);
            }
        }, "AI analysis request failed");
    }

    @GetMapping("/activity/{activityId}/best-efforts")
    public ResponseEntity<?> getActivityBestEfforts(
            Authentication authentication,
            @PathVariable String activityId) {
        return support.respond(() -> {
            var bestEfforts = intervalsService.fetchActivityBestEfforts(authentication.getName(), activityId);
            return bestEfforts == null ? Map.of("bestEfforts", new Object[]{}) : bestEfforts;
        }, "Failed to fetch best efforts");
    }

    @GetMapping("/activity/{activityId}/find-best-efforts")
    public ResponseEntity<?> findBestEfforts(
            Authentication authentication,
            @PathVariable String activityId,
            @RequestParam(required = false) String stream,
            @RequestParam(required = false) Integer duration,
            @RequestParam(required = false, defaultValue = "8") Integer count,
            @RequestParam(required = false) Float minValue,
            @RequestParam(required = false) Boolean excludeIntervals) {
        return support.respond(() -> {
            var efforts = intervalsService.findBestEfforts(
                    authentication.getName(), activityId, stream, duration, count, minValue, excludeIntervals);
            return efforts == null ? Map.of("efforts", new Object[]{}) : efforts;
        }, "Failed to find best efforts");
    }

    @GetMapping("/activity/{activityId}/compute-intervals")
    public ResponseEntity<?> computeIntervals(
            Authentication authentication,
            @PathVariable String activityId,
            @RequestParam(required = false, defaultValue = "watts") String stream,
            @RequestParam Integer duration,
            @RequestParam(required = false, defaultValue = "4") Integer count,
            @RequestParam(required = false) Integer skipSeconds,
            @RequestParam(required = false) Integer cooldownSeconds) {
        return support.respond(() -> Map.of("efforts", intervalsService.computeIntervalsFromStreams(
                authentication.getName(), activityId, stream, duration, count, skipSeconds, cooldownSeconds)),
                "Failed to compute intervals");
    }

    @PutMapping("/activity/{activityId}/intervals")
    public ResponseEntity<?> updateActivityIntervals(
            Authentication authentication,
            @PathVariable String activityId,
            @RequestBody List<Map<String, Object>> intervals,
            @RequestParam(required = false) Integer searchDuration) {
        return support.respond(() -> intervalsService.updateActivityIntervals(
                authentication.getName(), activityId, intervals, searchDuration),
                "Failed to update intervals");
    }

    @DeleteMapping("/activity/{activityId}")
    public ResponseEntity<?> deleteActivity(
            Authentication authentication,
            @PathVariable String activityId) {
        return support.respond(() -> {
            intervalsService.deleteActivity(authentication.getName(), activityId);
            return Map.of("success", true, "message", "Activity deleted successfully");
        }, "Failed to delete activity " + activityId);
    }

    @PostMapping(value = "/upload-activity", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadActivity(
            Authentication authentication,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "description", required = false) String description) {
        return support.respond(() -> intervalsService.uploadActivity(
                authentication.getName(), file, name, description), "Failed to upload activity");
    }

    @GetMapping("/training-preferences")
    public ResponseEntity<?> getTrainingPreferences(Authentication authentication) {
        try {
            return ResponseEntity.ok(intervalsService.getTrainingPreferences(authentication.getName()));
        } catch (Exception e) {
            log.error("Failed to fetch training preferences: {}", e.getMessage());
            return ResponseEntity.ok(Map.of());
        }
    }

    @PostMapping("/training-preferences")
    public ResponseEntity<?> saveTrainingPreferences(
            Authentication authentication,
            @RequestBody Map<String, Object> preferences) {
        return support.respond(() -> {
            intervalsService.saveTrainingPreferences(authentication.getName(), preferences);
            return Map.of("success", true, "message", "Preferences saved successfully");
        }, "Failed to save training preferences");
    }

    @GetMapping("/ai-usage")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getAIUsageStatistics() {
        return support.respond(aiUsageService::getUsageSummary, "Failed to fetch AI usage statistics");
    }

    @GetMapping("/my-ai-usage")
    public ResponseEntity<?> getMyAIUsage(
            Authentication authentication,
            @RequestParam(defaultValue = "10.50") double usdToSekRate) {
        return support.respond(() -> {
            Map<String, Object> usage = aiUsageService.getUserMonthlyUsage(authentication.getName(), usdToSekRate);
            var user = userService.getCurrentUser(authentication.getName());
            if (user.getOpenaiModel() != null) {
                usage.put("currentModel", user.getOpenaiModel());
            }
            return usage;
        }, "Failed to fetch user AI usage");
    }

    /** Activity types accepted by Intervals.icu (CategorySummary enum). */
    private static final java.util.Set<String> VALID_ACTIVITY_TYPES = java.util.Set.of(
            "Ride", "Run", "Swim", "WeightTraining", "Hike", "Walk", "AlpineSki",
            "BackcountrySki", "Badminton", "Canoeing", "Crossfit", "EBikeRide",
            "EMountainBikeRide", "Elliptical", "Golf", "GravelRide", "TrackRide",
            "Handcycle", "HighIntensityIntervalTraining", "Hockey", "IceSkate",
            "InlineSkate", "Kayaking", "Kitesurf", "MountainBikeRide", "NordicSki",
            "OpenWaterSwim", "Padel", "Pilates", "Pickleball", "Racquetball",
            "Rugby", "RockClimbing", "RollerSki", "Rowing", "Sail", "Skateboard",
            "Snowboard", "Snowshoe", "Soccer", "Squash", "StairStepper",
            "StandUpPaddling", "Surfing", "TableTennis", "Tennis", "TrailRun",
            "Transition", "Velomobile", "VirtualRide", "VirtualRow", "VirtualRun",
            "VirtualSki", "WaterSport", "Wheelchair", "Windsurf", "Workout",
            "Yoga", "Other");

    @PutMapping("/activity/{activityId}/feedback")
    public ResponseEntity<?> updateActivityFeedback(
            Authentication authentication,
            @PathVariable String activityId,
            @RequestBody Map<String, Object> feedback) {
        try {
            Map<String, Object> updateData = new java.util.HashMap<>();
            if (feedback.containsKey("name")) updateData.put("name", feedback.get("name"));
            if (feedback.containsKey("icu_rpe")) updateData.put("icu_rpe", feedback.get("icu_rpe"));
            if (feedback.containsKey("feel")) updateData.put("feel", feedback.get("feel"));
            if (feedback.containsKey("description")) updateData.put("description", feedback.get("description"));
            if (feedback.containsKey("icu_training_load")) updateData.put("icu_training_load", feedback.get("icu_training_load"));
            if (feedback.containsKey("type")) {
                Object type = feedback.get("type");
                if (!(type instanceof String) || !VALID_ACTIVITY_TYPES.contains(type)) {
                    return ResponseEntity.badRequest().body(Map.of("error", "Invalid activity type"));
                }
                updateData.put("type", type);
            }
            return ResponseEntity.ok(intervalsService.updateActivity(authentication.getName(), activityId, updateData));
        } catch (Exception e) {
            log.error("Failed to update activity feedback: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Failed to update activity feedback: " + e.getMessage()));
        }
    }

    @PostMapping("/version-seen")
    public ResponseEntity<?> markVersionAsSeen(
            Authentication authentication,
            @RequestBody Map<String, String> request) {
        try {
            String version = request.get("version");
            if (version == null || version.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Version is required"));
            }
            UserVersion userVersion = userVersionService.markVersionAsSeen(authentication.getName(), version);
            if (userVersion != null && userVersion.getSeenAt() != null) {
                log.info("User {} has seen version {} at {}", authentication.getName(), version, userVersion.getSeenAt());
                return ResponseEntity.ok(Map.of("success", true, "version", version, "seenAt", userVersion.getSeenAt()));
            }
            return ResponseEntity.ok(Map.of("success", true, "version", version, "message", "Version already seen"));
        } catch (Exception e) {
            log.error("Failed to mark version as seen for user {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Failed to mark version as seen"));
        }
    }

    @GetMapping("/version-seen/{version}")
    public ResponseEntity<?> hasUserSeenVersion(
            Authentication authentication,
            @PathVariable String version) {
        try {
            boolean hasSeen = userVersionService.hasUserSeenVersion(authentication.getName(), version);
            return ResponseEntity.ok(Map.of("hasSeen", hasSeen));
        } catch (Exception e) {
            log.error("Failed to check if user {} has seen version {}: {}", authentication.getName(), version, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Failed to check version status"));
        }
    }

    @GetMapping("/current-version")
    public ResponseEntity<?> getCurrentVersion() {
        return ResponseEntity.ok(Map.of("version", appVersion));
    }

    @GetMapping("/pending-achievements")
    public ResponseEntity<?> getPendingAchievements(Authentication authentication) {
        try {
            return ResponseEntity.ok(achievementNotificationService.getPendingAchievements(authentication.getName()));
        } catch (Exception e) {
            log.error("Failed to get pending achievements for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/achievement/{achievementId}/accept")
    public ResponseEntity<?> acceptAchievement(
            Authentication authentication,
            @PathVariable Long achievementId) {
        return support.respond(() -> {
            achievementNotificationService.acceptAchievement(authentication.getName(), achievementId);
            return Map.of("success", true);
        }, "Failed to accept achievement " + achievementId);
    }

    @PostMapping("/achievement/{achievementId}/dismiss")
    public ResponseEntity<?> dismissAchievement(
            Authentication authentication,
            @PathVariable Long achievementId) {
        return support.respond(() -> {
            achievementNotificationService.dismissAchievement(authentication.getName(), achievementId);
            return Map.of("success", true);
        }, "Failed to dismiss achievement " + achievementId);
    }

    @PostMapping("/achievement/by-activity/accept")
    public ResponseEntity<?> acceptAchievementByActivity(
            Authentication authentication,
            @RequestBody Map<String, Object> body) {
        AchievementBody b = parseAchievementBody(body);
        return support.respond(() -> {
            achievementNotificationService.acceptAchievementByActivity(
                        authentication.getName(), b.activityId, b.achievementType,
                        b.newFtpValue, b.oldFtpValue, b.effortWatts, b.effortSeconds,
                        b.newLthrValue, b.oldLthrValue, b.activityName, b.sportType, b.achievementDate, b.indoor);
                return Map.of("success", true);
            }, "Failed to accept achievement by activity");
    }

    @PostMapping("/achievement/by-activity/dismiss")
    public ResponseEntity<?> dismissAchievementByActivity(
            Authentication authentication,
            @RequestBody Map<String, Object> body) {
        AchievementBody b = parseAchievementBody(body);
        return support.respond(() -> {
            achievementNotificationService.dismissAchievementByActivity(
                        authentication.getName(), b.activityId, b.achievementType,
                        b.newFtpValue, b.oldFtpValue, b.effortWatts, b.effortSeconds,
                        b.newLthrValue, b.oldLthrValue, b.activityName, b.sportType, b.achievementDate, b.indoor);
                return Map.of("success", true);
            }, "Failed to dismiss achievement by activity");
    }

    @GetMapping("/achievements")
    public ResponseEntity<?> getAchievementsByDateRange(
            Authentication authentication,
            @RequestParam String startDate,
            @RequestParam String endDate) {
        return support.respond(() -> achievementNotificationService.getAllAchievementsByDateRange(
                authentication.getName(), java.time.LocalDate.parse(startDate), java.time.LocalDate.parse(endDate)),
                "Failed to get achievements");
    }

    @GetMapping("/activity/{activityId}/pace-curve")
    public ResponseEntity<?> getActivityPaceCurve(
            Authentication authentication,
            @PathVariable String activityId) {
        return support.respond(() -> {
            var result = paceCurveService.calculateActivityPaceCurve(authentication.getName(), activityId);
            return result == null
                    ? Map.of("message", "No pace data available for this activity")
                    : result;
        }, "Failed to get pace curve");
    }

    @GetMapping("/pace-curve-history")
    public ResponseEntity<?> getPaceCurveHistory(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        return support.respond(() -> paceCurveService.getPaceCurveHistory(
                authentication.getName(), oldest, newest), "Failed to get pace curve history");
    }

    /** Parsed achievement-by-activity request body shared by accept/dismiss. */
    private record AchievementBody(String activityId, String achievementType,
                                   Integer newFtpValue, Integer oldFtpValue,
                                   Integer effortWatts, Integer effortSeconds,
                                   Integer newLthrValue, Integer oldLthrValue,
                                   String activityName, String sportType,
                                   java.time.LocalDate achievementDate, Boolean indoor) {}

    private AchievementBody parseAchievementBody(Map<String, Object> body) {
        return new AchievementBody(
                (String) body.get("activityId"),
                (String) body.get("achievementType"),
                body.get("newFtpValue") != null ? ((Number) body.get("newFtpValue")).intValue() : null,
                body.get("oldFtpValue") != null ? ((Number) body.get("oldFtpValue")).intValue() : null,
                body.get("effortWatts") != null ? ((Number) body.get("effortWatts")).intValue() : null,
                body.get("effortSeconds") != null ? ((Number) body.get("effortSeconds")).intValue() : null,
                body.get("newLthrValue") != null ? ((Number) body.get("newLthrValue")).intValue() : null,
                body.get("oldLthrValue") != null ? ((Number) body.get("oldLthrValue")).intValue() : null,
                (String) body.get("activityName"),
                (String) body.get("sportType"),
                body.get("achievementDate") != null
                        ? java.time.LocalDate.parse((String) body.get("achievementDate")) : null,
                body.get("indoor") != null ? (Boolean) body.get("indoor") : null);
    }
}
