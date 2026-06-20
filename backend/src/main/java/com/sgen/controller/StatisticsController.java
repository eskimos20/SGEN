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
    private final CalendarEventService calendarEventService;
    private final UserVersionService userVersionService;
    private final AchievementNotificationService achievementNotificationService;
    private final UserService userService;
    private final PaceCurveService paceCurveService;

    @GetMapping("/fetch")
    public ResponseEntity<Map<String, Object>> fetchStatistics(
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

        Map<String, Object> data = intervalsService.fetchAllData(authentication.getName(), start, end);

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
        try {
            JsonNode powerCurveHistory = intervalsService.getPowerCurveHistory(
                    authentication.getName(), oldest, newest, type);
            return ResponseEntity.ok(powerCurveHistory);
        } catch (Exception e) {
            log.error("Failed to fetch power curve history: {}", e.getMessage());
            return ResponseEntity.badRequest().body(objectMapper.createObjectNode()
                    .put("error", e.getMessage()));
        }
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
        try {
            String prompt = (String) request.get("prompt");
            @SuppressWarnings("unchecked")
            Map<String, Object> requestData = (Map<String, Object>) request.get("data");
            @SuppressWarnings("unchecked")
            List<Map<String, String>> conversationHistory = (List<Map<String, String>>) request.get("conversationHistory");
            String data = objectMapper.writeValueAsString(requestData);
            String analysis = openAIService.analyzeWithAI(authentication.getName(), prompt, data, conversationHistory);
            return ResponseEntity.ok(Map.of("analysis", analysis));
        } catch (Exception e) {
            log.error("AI analysis request failed: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/activity/{activityId}/best-efforts")
    public ResponseEntity<?> getActivityBestEfforts(
            Authentication authentication,
            @PathVariable String activityId) {
        try {
            var bestEfforts = intervalsService.fetchActivityBestEfforts(authentication.getName(), activityId);
            if (bestEfforts == null) return ResponseEntity.ok(Map.of("bestEfforts", new Object[]{}));
            return ResponseEntity.ok(bestEfforts);
        } catch (Exception e) {
            log.error("Failed to fetch best efforts: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
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
        try {
            var efforts = intervalsService.findBestEfforts(
                    authentication.getName(), activityId, stream, duration, count, minValue, excludeIntervals);
            if (efforts == null) return ResponseEntity.ok(Map.of("efforts", new Object[]{}));
            return ResponseEntity.ok(efforts);
        } catch (Exception e) {
            log.error("Failed to find best efforts: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
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
        try {
            var efforts = intervalsService.computeIntervalsFromStreams(
                    authentication.getName(), activityId, stream, duration, count, skipSeconds, cooldownSeconds);
            return ResponseEntity.ok(Map.of("efforts", efforts));
        } catch (Exception e) {
            log.error("Failed to compute intervals: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/activity/{activityId}/intervals")
    public ResponseEntity<?> updateActivityIntervals(
            Authentication authentication,
            @PathVariable String activityId,
            @RequestBody List<Map<String, Object>> intervals,
            @RequestParam(required = false) Integer searchDuration) {
        try {
            var result = intervalsService.updateActivityIntervals(
                    authentication.getName(), activityId, intervals, searchDuration);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to update intervals: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/activity/{activityId}")
    public ResponseEntity<?> deleteActivity(
            Authentication authentication,
            @PathVariable String activityId) {
        try {
            intervalsService.deleteActivity(authentication.getName(), activityId);
            return ResponseEntity.ok(Map.of("success", true, "message", "Activity deleted successfully"));
        } catch (Exception e) {
            log.error("Failed to delete activity {}: {}", activityId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping(value = "/upload-activity", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadActivity(
            Authentication authentication,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "description", required = false) String description) {
        try {
            var result = intervalsService.uploadActivity(authentication.getName(), file, name, description);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to upload activity: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
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
        try {
            intervalsService.saveTrainingPreferences(authentication.getName(), preferences);
            return ResponseEntity.ok(Map.of("success", true, "message", "Preferences saved successfully"));
        } catch (Exception e) {
            log.error("Failed to save training preferences: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/ai-usage")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getAIUsageStatistics() {
        try {
            return ResponseEntity.ok(aiUsageService.getUsageSummary());
        } catch (Exception e) {
            log.error("Failed to fetch AI usage statistics: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/my-ai-usage")
    public ResponseEntity<?> getMyAIUsage(
            Authentication authentication,
            @RequestParam(defaultValue = "10.50") double usdToSekRate) {
        try {
            Map<String, Object> usage = aiUsageService.getUserMonthlyUsage(authentication.getName(), usdToSekRate);
            // Add user's current model to response
            var user = userService.getCurrentUser(authentication.getName());
            if (user.getOpenaiModel() != null) {
                usage.put("currentModel", user.getOpenaiModel());
            }
            return ResponseEntity.ok(usage);
        } catch (Exception e) {
            log.error("Failed to fetch user AI usage: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

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
        try {
            achievementNotificationService.acceptAchievement(authentication.getName(), achievementId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("Failed to accept achievement {} for {}: {}", achievementId, authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/achievement/{achievementId}/dismiss")
    public ResponseEntity<?> dismissAchievement(
            Authentication authentication,
            @PathVariable Long achievementId) {
        try {
            achievementNotificationService.dismissAchievement(authentication.getName(), achievementId);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("Failed to dismiss achievement {} for {}: {}", achievementId, authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/achievement/by-activity/accept")
    public ResponseEntity<?> acceptAchievementByActivity(
            Authentication authentication,
            @RequestBody Map<String, Object> body) {
        try {
            String activityId = (String) body.get("activityId");
            String achievementType = (String) body.get("achievementType");
            Integer newFtpValue = body.get("newFtpValue") != null ? ((Number) body.get("newFtpValue")).intValue() : null;
            Integer oldFtpValue = body.get("oldFtpValue") != null ? ((Number) body.get("oldFtpValue")).intValue() : null;
            Integer effortWatts = body.get("effortWatts") != null ? ((Number) body.get("effortWatts")).intValue() : null;
            Integer effortSeconds = body.get("effortSeconds") != null ? ((Number) body.get("effortSeconds")).intValue() : null;
            Integer newLthrValue = body.get("newLthrValue") != null ? ((Number) body.get("newLthrValue")).intValue() : null;
            Integer oldLthrValue = body.get("oldLthrValue") != null ? ((Number) body.get("oldLthrValue")).intValue() : null;
            String activityName = (String) body.get("activityName");
            String sportType = (String) body.get("sportType");
            java.time.LocalDate achievementDate = body.get("achievementDate") != null
                    ? java.time.LocalDate.parse((String) body.get("achievementDate")) : null;
            achievementNotificationService.acceptAchievementByActivity(
                    authentication.getName(), activityId, achievementType,
                    newFtpValue, oldFtpValue, effortWatts, effortSeconds,
                    newLthrValue, oldLthrValue, activityName, sportType, achievementDate);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("Failed to accept achievement by activity for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/achievement/by-activity/dismiss")
    public ResponseEntity<?> dismissAchievementByActivity(
            Authentication authentication,
            @RequestBody Map<String, Object> body) {
        try {
            String activityId = (String) body.get("activityId");
            String achievementType = (String) body.get("achievementType");
            Integer newFtpValue = body.get("newFtpValue") != null ? ((Number) body.get("newFtpValue")).intValue() : null;
            Integer oldFtpValue = body.get("oldFtpValue") != null ? ((Number) body.get("oldFtpValue")).intValue() : null;
            Integer effortWatts = body.get("effortWatts") != null ? ((Number) body.get("effortWatts")).intValue() : null;
            Integer effortSeconds = body.get("effortSeconds") != null ? ((Number) body.get("effortSeconds")).intValue() : null;
            Integer newLthrValue = body.get("newLthrValue") != null ? ((Number) body.get("newLthrValue")).intValue() : null;
            Integer oldLthrValue = body.get("oldLthrValue") != null ? ((Number) body.get("oldLthrValue")).intValue() : null;
            String activityName = (String) body.get("activityName");
            String sportType = (String) body.get("sportType");
            java.time.LocalDate achievementDate = body.get("achievementDate") != null
                    ? java.time.LocalDate.parse((String) body.get("achievementDate")) : null;
            achievementNotificationService.dismissAchievementByActivity(
                    authentication.getName(), activityId, achievementType,
                    newFtpValue, oldFtpValue, effortWatts, effortSeconds,
                    newLthrValue, oldLthrValue, activityName, sportType, achievementDate);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("Failed to dismiss achievement by activity for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/achievements")
    public ResponseEntity<?> getAchievementsByDateRange(
            Authentication authentication,
            @RequestParam String startDate,
            @RequestParam String endDate) {
        try {
            java.time.LocalDate start = java.time.LocalDate.parse(startDate);
            java.time.LocalDate end = java.time.LocalDate.parse(endDate);
            return ResponseEntity.ok(achievementNotificationService.getAllAchievementsByDateRange(
                    authentication.getName(), start, end));
        } catch (Exception e) {
            log.error("Failed to get achievements for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/activity/{activityId}/pace-curve")
    public ResponseEntity<?> getActivityPaceCurve(
            Authentication authentication,
            @PathVariable String activityId) {
        try {
            var result = paceCurveService.calculateActivityPaceCurve(authentication.getName(), activityId);
            if (result == null) {
                return ResponseEntity.ok(Map.of("message", "No pace data available for this activity"));
            }
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Failed to get pace curve for activity {}: {}", activityId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/pace-curve-history")
    public ResponseEntity<?> getPaceCurveHistory(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        try {
            var results = paceCurveService.getPaceCurveHistory(authentication.getName(), oldest, newest);
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            log.error("Failed to get pace curve history: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
