package com.sgen.controller;

import com.sgen.service.CustomWorkoutService;
import com.sgen.service.WorkoutLibraryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class WorkoutController {

    private final WorkoutLibraryService workoutLibraryService;
    private final CustomWorkoutService customWorkoutService;

    @PostMapping("/generate-random-workouts")
    public ResponseEntity<?> generateRandomWorkouts(
            Authentication authentication,
            @RequestBody Map<String, Object> request) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> workoutRequests = (List<Map<String, Object>>) request.get("workouts");
            if (workoutRequests == null || workoutRequests.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "No workout requests provided"));
            }

            var events = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
            for (Map<String, Object> wr : workoutRequests) {
                String category = (String) wr.get("category");
                String date = (String) wr.get("date");
                int maxDuration = wr.get("maxDuration") != null ? ((Number) wr.get("maxDuration")).intValue() : 180;
                int minDuration = wr.get("minDuration") != null ? ((Number) wr.get("minDuration")).intValue() : -1;
                double progressionScale = wr.get("progressionScale") != null ? ((Number) wr.get("progressionScale")).doubleValue() : 1.0;
                String activityType = wr.get("activityType") != null ? (String) wr.get("activityType") : "Cycling";

                if (category == null || date == null) {
                    log.warn("Skipping workout request with missing category or date");
                    continue;
                }
                
                // First try workout-library
                var event = workoutLibraryService.selectWorkoutByTSS(category, date, maxDuration, minDuration, progressionScale, activityType);
                
                // If not found, try user's custom-workout-library as fallback
                if (event == null) {
                    log.info("Workout not found in library for category {}, trying custom workouts for user {}", 
                             category, authentication.getName());
                    event = customWorkoutService.selectCustomWorkoutByTSS(
                            authentication.getName(), category, date, maxDuration, minDuration, progressionScale, activityType);
                }
                
                if (event != null) events.add(event);
            }
            return ResponseEntity.ok(Map.of("events", events));
        } catch (Exception e) {
            log.error("Failed to generate random workouts: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/workout-library")
    public ResponseEntity<?> searchWorkoutLibrary(
            @RequestParam(required = false) String categories,
            @RequestParam(required = false) Integer minTss,
            @RequestParam(required = false) Integer maxTss,
            @RequestParam(required = false) String sportType,
            @RequestParam(required = false) Integer minDuration,
            @RequestParam(required = false) Integer maxDuration,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortOrder,
            Authentication authentication) {
        try {
            List<String> categoryList = categories != null && !categories.isEmpty()
                    ? Arrays.asList(categories.split(",")) : new ArrayList<>();
            if (minTss == null) minTss = 0;
            if (maxTss == null) maxTss = 999;
            if (sortBy == null || sortBy.isEmpty()) sortBy = "duration";
            if (sortOrder == null || sortOrder.isEmpty()) sortOrder = "asc";
            return ResponseEntity.ok(workoutLibraryService.searchWorkoutLibrary(
                    categoryList, minTss, maxTss, sportType, minDuration, maxDuration, sortBy, sortOrder));
        } catch (Exception e) {
            log.error("Failed to search workout library for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/custom-workouts")
    public ResponseEntity<?> searchCustomWorkouts(
            @RequestParam(required = false) String categories,
            @RequestParam(required = false) Integer minTss,
            @RequestParam(required = false) Integer maxTss,
            @RequestParam(required = false) String sportType,
            @RequestParam(required = false) Integer minDuration,
            @RequestParam(required = false) Integer maxDuration,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortOrder,
            Authentication authentication) {
        try {
            List<String> categoryList = categories != null && !categories.isEmpty()
                    ? Arrays.asList(categories.split(",")) : new ArrayList<>();
            if (minTss == null) minTss = 0;
            if (maxTss == null) maxTss = 999;
            if (sortBy == null || sortBy.isEmpty()) sortBy = "duration";
            if (sortOrder == null || sortOrder.isEmpty()) sortOrder = "asc";
            return ResponseEntity.ok(customWorkoutService.searchCustomWorkouts(
                    authentication.getName(), categoryList, minTss, maxTss, sportType, minDuration, maxDuration, sortBy, sortOrder));
        } catch (Exception e) {
            log.error("Failed to search custom workouts for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/custom-workouts-all")
    public ResponseEntity<?> getCustomWorkouts(Authentication authentication) {
        try {
            return ResponseEntity.ok(Map.of("workouts", customWorkoutService.getCustomWorkouts(authentication.getName())));
        } catch (Exception e) {
            log.error("Failed to get custom workouts for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/custom-workouts")
    public ResponseEntity<?> saveCustomWorkout(
            Authentication authentication,
            @RequestBody Map<String, Object> request) {
        try {
            String category = (String) request.get("category");
            Integer tss = (Integer) request.get("tss");
            String name = (String) request.get("name");
            String description = (String) request.get("description");
            String shortDescription = (String) request.get("shortDescription");
            String zwoContent = (String) request.get("zwoContent");
            Object workoutDoc = request.get("workoutDoc");
            Object duration = request.get("duration");
            String filename = customWorkoutService.saveCustomWorkout(
                    authentication.getName(), category, tss, name, description, shortDescription, zwoContent, workoutDoc, duration);
            log.info("User {} saved custom workout: {}", authentication.getName(), filename);
            return ResponseEntity.ok(Map.of("filename", filename));
        } catch (Exception e) {
            log.error("Failed to save custom workout for {}: {}", authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/custom-workouts/{filename}")
    public ResponseEntity<?> deleteCustomWorkout(
            @PathVariable String filename,
            Authentication authentication) {
        try {
            boolean deleted = customWorkoutService.deleteCustomWorkout(authentication.getName(), filename);
            if (deleted) {
                log.info("User {} deleted custom workout: {}", authentication.getName(), filename);
                return ResponseEntity.ok(Map.of("message", "Workout deleted successfully"));
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Failed to delete custom workout {} for {}: {}", filename, authentication.getName(), e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/workout-library/zwo")
    public ResponseEntity<?> getWorkoutLibraryZwo(
            @RequestParam String path,
            @RequestParam(required = false, defaultValue = "bike") String sportType) {
        try {
            String content = workoutLibraryService.getZwoContent(path, sportType);
            return ResponseEntity.ok(Map.of("content", content));
        } catch (Exception e) {
            log.error("Failed to read ZWO file from library: {}", path, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Failed to read workout file"));
        }
    }

    @GetMapping("/custom-workouts/zwo")
    public ResponseEntity<?> getCustomWorkoutZwo(
            @RequestParam String path,
            Authentication authentication) {
        try {
            String content = customWorkoutService.getZwoContent(authentication.getName(), path);
            return ResponseEntity.ok(Map.of("content", content));
        } catch (Exception e) {
            log.error("Failed to read custom ZWO file for {}: {}", authentication.getName(), path, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "Failed to read custom workout file"));
        }
    }
}
