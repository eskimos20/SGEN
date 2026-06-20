package com.sgen.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.model.WorkoutTemplate;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Slf4j
public class CustomWorkoutService {

    private final ObjectMapper objectMapper;
    private final ZwoParser zwoParser;

    private static final String CUSTOM_LIBRARY_BASE = "./custom-workout-library/";
    private static final List<String> ALL_CATEGORIES = Arrays.asList(
            "Endurance", "Tempo", "SweetSpot", "Threshold", "VO2Max", "Anaerobic", "Sprint");

    // Cache structure: username -> category -> list of WorkoutTemplates
    private final Map<String, Map<String, List<WorkoutTemplate>>> customWorkoutCache = new HashMap<>();
    private final Map<String, Boolean> userCacheLoaded = new HashMap<>();

    @PostConstruct
    public void init() {
        loadAllCustomWorkoutsAtBoot();
    }

    private void loadAllCustomWorkoutsAtBoot() {
        log.info("Loading custom workout library from: {}", CUSTOM_LIBRARY_BASE);
        long start = System.currentTimeMillis();
        
        Path basePath = Paths.get(CUSTOM_LIBRARY_BASE);
        if (!Files.exists(basePath)) {
            log.info("Custom workout library base path does not exist yet: {}", CUSTOM_LIBRARY_BASE);
            return;
        }

        try (Stream<Path> userDirs = Files.list(basePath)) {
            List<Path> users = userDirs.filter(Files::isDirectory).collect(Collectors.toList());
            log.info("Found {} user(s) with custom workouts", users.size());
            
            for (Path userDir : users) {
                String username = userDir.getFileName().toString();
                getOrLoadUserCache(username); // This loads and caches the user's workouts
            }
        } catch (Exception e) {
            log.error("Failed to load custom workout library at boot: {}", e.getMessage());
        }
        
        int totalUsers = customWorkoutCache.size();
        int totalWorkouts = customWorkoutCache.values().stream()
                .mapToInt(m -> m.values().stream().mapToInt(List::size).sum())
                .sum();
        log.info("Custom workout library loaded: {} users, {} workouts in {}ms", 
                totalUsers, totalWorkouts, System.currentTimeMillis() - start);
    }

    public String saveCustomWorkout(String username, String category, Integer tss, String name,
                                    String description, String shortDescription, String zwoContent, Object workoutDoc, Object duration) throws Exception {
        Path categoryPath = Paths.get(CUSTOM_LIBRARY_BASE + username).resolve(category);
        if (!Files.exists(categoryPath)) {
            Files.createDirectories(categoryPath);
            log.info("Created custom workout category directory: {}", categoryPath);
        }

        String baseFilename = category + "_TSS_" + tss;
        int version = 1;
        String filename;
        Path filePath;
        do {
            filename = baseFilename + "_v" + version + ".zwo";
            filePath = categoryPath.resolve(filename);
            version++;
        } while (Files.exists(filePath));

        Files.writeString(filePath, zwoContent);

        if (workoutDoc != null) {
            String jsonFilename = baseFilename + "_v" + (version - 1) + ".json";
            Map<String, Object> metadata = new HashMap<>();
            metadata.put("workout_doc", workoutDoc);
            if (duration != null) metadata.put("duration", duration);
            metadata.put("tss", tss);
            metadata.put("name", name);
            metadata.put("description", description);
            if (shortDescription != null && !shortDescription.isEmpty()) {
                metadata.put("shortDescription", shortDescription);
            }
            Files.writeString(categoryPath.resolve(jsonFilename), objectMapper.writeValueAsString(metadata));
            log.info("Saved workout metadata: {}", jsonFilename);
        }

        log.info("Saved custom workout: {}", filename);
        
        // Invalidate cache for this user to force reload on next access
        invalidateUserCache(username);
        
        return filename;
    }

    private void invalidateUserCache(String username) {
        customWorkoutCache.remove(username);
        userCacheLoaded.remove(username);
        log.debug("Invalidated custom workout cache for user: {}", username);
    }

    private Map<String, List<WorkoutTemplate>> getOrLoadUserCache(String username) {
        // If already loaded, return from cache
        if (userCacheLoaded.getOrDefault(username, false)) {
            return customWorkoutCache.getOrDefault(username, new HashMap<>());
        }
        
        // Load from disk
        Map<String, List<WorkoutTemplate>> userCache = new HashMap<>();
        Path basePath = Paths.get(CUSTOM_LIBRARY_BASE + username);
        
        if (!Files.exists(basePath)) {
            userCacheLoaded.put(username, true);
            customWorkoutCache.put(username, userCache);
            return userCache;
        }
        
        try (Stream<Path> categories = Files.list(basePath)) {
            for (Path categoryDir : categories.filter(Files::isDirectory).collect(Collectors.toList())) {
                String categoryName = categoryDir.getFileName().toString();
                List<WorkoutTemplate> workouts = new ArrayList<>();
                
                try (Stream<Path> files = Files.list(categoryDir)) {
                    for (Path file : files.filter(p -> p.toString().toLowerCase().endsWith(".zwo"))
                            .collect(Collectors.toList())) {
                        try {
                            WorkoutTemplate w = zwoParser.parse(file, categoryName);
                            if (w != null) workouts.add(w);
                        } catch (Exception e) {
                            log.debug("Failed to parse {}: {}", file.getFileName(), e.getMessage());
                        }
                    }
                }
                
                if (!workouts.isEmpty()) {
                    userCache.put(categoryName, workouts);
                }
            }
        } catch (Exception e) {
            log.error("Failed to load custom workouts for user {}: {}", username, e.getMessage());
        }
        
        userCacheLoaded.put(username, true);
        customWorkoutCache.put(username, userCache);
        log.info("Loaded {} categories of custom workouts for user {}", userCache.size(), username);
        
        return userCache;
    }

    public List<Map<String, Object>> searchCustomWorkouts(String username, List<String> categories,
                                                           Integer minTss, Integer maxTss, String sportType,
                                                           Integer minDuration, Integer maxDuration,
                                                           String sortBy, String sortOrder) throws Exception {
        List<Map<String, Object>> workouts = new ArrayList<>();
        
        // Use cached data instead of reading from disk
        Map<String, List<WorkoutTemplate>> userCache = getOrLoadUserCache(username);
        if (userCache.isEmpty()) return workouts;

        List<String> toSearch = categories.isEmpty() ? ALL_CATEGORIES : categories;
        for (String categoryName : toSearch) {
            List<WorkoutTemplate> categoryWorkouts = userCache.get(categoryName);
            if (categoryWorkouts == null) continue;
            
            for (WorkoutTemplate w : categoryWorkouts) {
                if (!matchesFilters(w, minTss, maxTss, sportType, minDuration, maxDuration)) continue;
                
                // Reconstruct file path for zwoContent
                Path filePath = Paths.get(CUSTOM_LIBRARY_BASE + username, categoryName, w.getOriginalFileName() + ".zwo");
                workouts.add(buildWorkoutInfo(filePath, w, categoryName));
            }
        }
        sortWorkouts(workouts, sortBy, sortOrder);
        return workouts;
    }

    public List<Map<String, Object>> getCustomWorkouts(String username) throws Exception {
        List<Map<String, Object>> workouts = new ArrayList<>();
        
        // Use cached data instead of reading from disk
        Map<String, List<WorkoutTemplate>> userCache = getOrLoadUserCache(username);
        
        for (Map.Entry<String, List<WorkoutTemplate>> entry : userCache.entrySet()) {
            String categoryName = entry.getKey();
            for (WorkoutTemplate w : entry.getValue()) {
                Map<String, Object> info = new HashMap<>();
                info.put("filename", w.getOriginalFileName());
                info.put("category", categoryName);
                info.put("name", w.getGeneratedName());
                info.put("tss", w.getEstimatedTSS());
                info.put("duration", w.getDurationMinutes());
                info.put("description", w.getDescription());
                workouts.add(info);
            }
        }
        return workouts;
    }

    public ObjectNode selectCustomWorkoutByTSS(String username, String category, String date, int maxDuration,
                                                  int minDurationParam, double progressionScale, String activityType) {
        try {
            String normalizedCategory = normalizeCategory(category);
            
            // Use cached data instead of reading from disk
            Map<String, List<WorkoutTemplate>> userCache = getOrLoadUserCache(username);
            List<WorkoutTemplate> workouts = userCache.get(normalizedCategory);
            
            if (workouts == null || workouts.isEmpty()) {
                log.warn("No custom workouts found for user {} in category {}", username, normalizedCategory);
                return null;
            }

            final int minDuration = minDurationParam >= 0 ? minDurationParam : (int) (maxDuration * 0.60);
            List<WorkoutTemplate> validWorkouts = workouts.stream()
                    .filter(w -> w.getDurationMinutes() >= minDuration && w.getDurationMinutes() <= maxDuration)
                    .collect(Collectors.toList());

            if (validWorkouts.isEmpty()) {
                log.warn("No valid custom workouts for user {} category {} with duration {}-{}", 
                        username, normalizedCategory, minDuration, maxDuration);
                return null;
            }

            double avgTSS = validWorkouts.stream().mapToInt(WorkoutTemplate::getEstimatedTSS).average().orElse(50.0);
            double targetTSS = avgTSS * progressionScale;

            validWorkouts.sort((a, b) -> Double.compare(
                    Math.abs(a.getEstimatedTSS() - targetTSS),
                    Math.abs(b.getEstimatedTSS() - targetTSS)));

            double bestDiff = Math.abs(validWorkouts.get(0).getEstimatedTSS() - targetTSS);
            double tolerance = Math.max(bestDiff * 1.5, 5);
            List<WorkoutTemplate> closest = validWorkouts.stream()
                    .filter(w -> Math.abs(w.getEstimatedTSS() - targetTSS) <= tolerance)
                    .collect(Collectors.toList());

            WorkoutTemplate selected = closest.get(ThreadLocalRandom.current().nextInt(closest.size()));

            String workoutName = (selected.getShortDescription() != null && !selected.getShortDescription().isBlank())
                    ? String.format("%s TSS%d %s", normalizedCategory, selected.getEstimatedTSS(), selected.getShortDescription())
                    : String.format("%s TSS%d", normalizedCategory, selected.getEstimatedTSS());

            ObjectNode event = objectMapper.createObjectNode();
            event.put("start_date_local", date + "T00:00:00");
            event.put("name", workoutName);
            event.put("description", selected.getDescription());
            event.put("type", "Running".equals(activityType) ? "Run" : "Ride");
            event.put("category", "WORKOUT");
            event.put("originalFileName", selected.getOriginalFileName());

            ObjectNode workoutDoc = (ObjectNode) selected.getWorkoutDoc().deepCopy();
            workoutDoc.put("sport_type", activityType);
            event.set("workout_doc", workoutDoc);

            if (selected.getShortDescription() != null) {
                event.put("shortDescription", selected.getShortDescription());
            }

            String zwoFilePath = selected.getZwoFilePath();
            if (zwoFilePath != null) {
                try {
                    String zwoContent = Files.readString(Path.of(zwoFilePath));
                    if ("Running".equals(activityType)) {
                        zwoContent = zwoContent.replace("<sportType>bike</sportType>", "<sportType>run</sportType>");
                    }
                    event.put("file_contents", zwoContent);
                    event.put("filename", normalizedCategory + "_TSS_" + selected.getEstimatedTSS() + ".zwo");
                } catch (Exception e) {
                    log.warn("Failed to read ZWO file {}: {}", zwoFilePath, e.getMessage());
                }
            }

            log.info("Selected custom workout for user {}: {} (TSS {})", username, workoutName, selected.getEstimatedTSS());
            return event;
        } catch (Exception e) {
            log.error("Failed to select custom workout for user {}: {}", username, e.getMessage(), e);
            return null;
        }
    }

    private String normalizeCategory(String category) {
        return java.util.Map.of("VO2Max", "VO2Max", "VO2max", "VO2Max", "Threshold", "Threshold",
                "Endurance", "Endurance", "SweetSpot", "SweetSpot", "Sweet Spot", "SweetSpot",
                "Sweetspot", "SweetSpot", "Tempo", "Tempo", "Anaerobic", "Anaerobic", "Sprint", "Sprint")
                .getOrDefault(category, category);
    }

    public boolean deleteCustomWorkout(String username, String filename) throws Exception {
        Path basePath = Paths.get(CUSTOM_LIBRARY_BASE + username);
        if (!Files.exists(basePath)) return false;
        try (Stream<Path> categories = Files.list(basePath)) {
            for (Path categoryDir : categories.filter(Files::isDirectory).collect(Collectors.toList())) {
                Path filePath = categoryDir.resolve(filename);
                if (Files.exists(filePath) && Files.isRegularFile(filePath)) {
                    Files.delete(filePath);
                    log.info("Deleted custom workout: {}/{}", categoryDir.getFileName(), filename);
                    
                    // Also delete corresponding .json metadata file if it exists
                    String jsonFilename = filename.replace(".zwo", ".json");
                    Path jsonFilePath = categoryDir.resolve(jsonFilename);
                    if (Files.exists(jsonFilePath)) {
                        Files.delete(jsonFilePath);
                        log.info("Deleted custom workout metadata: {}/{}", categoryDir.getFileName(), jsonFilename);
                    }
                    
                    // Invalidate cache for this user
                    invalidateUserCache(username);
                    
                    return true;
                }
            }
        }
        log.warn("Custom workout not found for deletion: {}", filename);
        return false;
    }

    private boolean matchesFilters(WorkoutTemplate w, Integer minTss, Integer maxTss,
                                   String sportType, Integer minDuration, Integer maxDuration) {
        int tss = w.getEstimatedTSS();
        int duration = w.getDurationMinutes();
        boolean tssMatch = (minTss == null || maxTss == null) || (tss >= minTss && tss <= maxTss);
        boolean durMatch = (minDuration == null || maxDuration == null) || (duration >= minDuration && duration <= maxDuration);
        if (!tssMatch || !durMatch) return false;
        if (sportType != null && !sportType.isEmpty()) {
            String zwoSportType = sportType.equalsIgnoreCase("Ride") ? "bike"
                    : sportType.equalsIgnoreCase("Run") ? "run" : sportType.toLowerCase();
            return zwoSportType.equalsIgnoreCase(w.getSportType());
        }
        return true;
    }

    private Map<String, Object> buildWorkoutInfo(Path file, WorkoutTemplate w, String categoryName) throws Exception {
        Map<String, Object> info = new HashMap<>();
        info.put("filename", file.getFileName().toString());
        info.put("category", categoryName);
        info.put("name", w.getGeneratedName());
        info.put("tss", w.getEstimatedTSS());
        info.put("duration", w.getDurationMinutes());
        info.put("description", w.getDescription());
        info.put("workout_doc", w.getWorkoutDoc());
        info.put("sportType", w.getSportType());
        info.put("source", "custom");
        info.put("zwoContent", Files.readString(file));
        if (w.getShortDescription() != null) {
            info.put("shortDescription", w.getShortDescription());
        }

        // Override workout_doc, duration, name and shortDescription from JSON metadata if available
        String jsonFilename = file.getFileName().toString().replace(".zwo", ".json");
        Path jsonFile = file.getParent().resolve(jsonFilename);
        if (Files.exists(jsonFile)) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> meta = objectMapper.readValue(Files.readString(jsonFile), Map.class);
                if (meta.containsKey("workout_doc")) info.put("workout_doc", meta.get("workout_doc"));
                if (meta.containsKey("duration")) info.put("duration", meta.get("duration"));
                if (meta.containsKey("name")) info.put("name", meta.get("name"));
                if (meta.containsKey("shortDescription")) info.put("shortDescription", meta.get("shortDescription"));
            } catch (Exception e) {
                log.warn("Failed to load metadata from {}: {}", jsonFilename, e.getMessage());
            }
        }
        return info;
    }

    private void sortWorkouts(List<Map<String, Object>> workouts, String sortBy, String sortOrder) {
        if (workouts == null || workouts.isEmpty() || sortBy == null || sortBy.isEmpty()) return;
        workouts.sort((a, b) -> {
            Object av = a.get(sortBy.toLowerCase().equals("category") ? "category"
                    : sortBy.toLowerCase().equals("tss") ? "tss" : "duration");
            Object bv = b.get(sortBy.toLowerCase().equals("category") ? "category"
                    : sortBy.toLowerCase().equals("tss") ? "tss" : "duration");
            if (av == null && bv == null) return 0;
            if (av == null) return sortOrder.equalsIgnoreCase("asc") ? 1 : -1;
            if (bv == null) return sortOrder.equalsIgnoreCase("asc") ? -1 : 1;
            int cmp = av instanceof String ? ((String) av).compareToIgnoreCase((String) bv)
                    : Double.compare(((Number) av).doubleValue(), ((Number) bv).doubleValue());
            return sortOrder.equalsIgnoreCase("desc") ? -cmp : cmp;
        });
    }

    public String getZwoContent(String username, String zwoFilePath) throws Exception {
        if (zwoFilePath == null || zwoFilePath.isEmpty()) {
            throw new IllegalArgumentException("ZWO file path is required");
        }
        
        // Validate the path is within the user's directory (security check)
        String userDir = CUSTOM_LIBRARY_BASE + username + "/";
        if (!zwoFilePath.startsWith(userDir)) {
            throw new SecurityException("Invalid ZWO file path");
        }
        
        return Files.readString(Path.of(zwoFilePath));
    }
}
