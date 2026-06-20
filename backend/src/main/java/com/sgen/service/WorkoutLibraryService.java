package com.sgen.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.model.WorkoutTemplate;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
@Slf4j
@RequiredArgsConstructor
public class WorkoutLibraryService {

    private final ObjectMapper objectMapper;
    private final ZwoParser zwoParser;

    @Value("${workout.library.path:./workout-library}")
    private String workoutLibraryPath;

    private final Map<String, List<WorkoutTemplate>> workoutLibrary = new HashMap<>();
    private boolean libraryLoaded = false;

    private static final List<String> ALL_CATEGORIES = Arrays.asList(
            "Endurance", "Tempo", "SweetSpot", "Threshold", "VO2Max", "Anaerobic", "Sprint");

    @PostConstruct
    public void init() {
        loadWorkoutLibrary();
    }

    public Map<String, Integer> getLibraryStats() {
        Map<String, Integer> stats = new HashMap<>();
        for (Map.Entry<String, List<WorkoutTemplate>> entry : workoutLibrary.entrySet()) {
            stats.put(entry.getKey(), entry.getValue().size());
        }
        return stats;
    }

    public String getWorkoutDescription(String originalFileName) {
        if (originalFileName == null || originalFileName.isEmpty()) return null;
        for (List<WorkoutTemplate> workouts : workoutLibrary.values()) {
            for (WorkoutTemplate workout : workouts) {
                if (originalFileName.equals(workout.getOriginalFileName())) {
                    return workout.getShortDescription();
                }
            }
        }
        return null;
    }

    public ObjectNode selectWorkoutByTSS(String category, String date, int maxDuration,
                                          int minDurationParam, double progressionScale, String activityType) {
        if (!libraryLoaded) loadWorkoutLibrary();

        String normalizedCategory = normalizeCategory(category);
        List<WorkoutTemplate> categoryWorkouts = workoutLibrary.get(normalizedCategory);
        if (categoryWorkouts == null || categoryWorkouts.isEmpty()) return null;

        final int minDuration = minDurationParam >= 0 ? minDurationParam : (int) (maxDuration * 0.60);
        List<WorkoutTemplate> validWorkouts = categoryWorkouts.stream()
                .filter(w -> w.getDurationMinutes() >= minDuration && w.getDurationMinutes() <= maxDuration)
                .collect(Collectors.toList());

        if (validWorkouts.isEmpty()) {
            log.warn("No valid workouts for {} with duration {}-{}", normalizedCategory, minDuration, maxDuration);
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

        return event;
    }

    public List<Map<String, Object>> searchWorkoutLibrary(List<String> categories, Integer minTss, Integer maxTss,
                                                           String sportType, Integer minDuration, Integer maxDuration,
                                                           String sortBy, String sortOrder) throws Exception {
        // Ensure library is loaded from cache (not disk on every search)
        if (!libraryLoaded) {
            loadWorkoutLibrary();
        }

        List<Map<String, Object>> workouts = new ArrayList<>();
        List<String> toSearch = categories.isEmpty() ? ALL_CATEGORIES : categories;

        // Use in-memory cache instead of reading from disk
        for (String categoryName : toSearch) {
            List<WorkoutTemplate> categoryWorkouts = workoutLibrary.get(categoryName);
            if (categoryWorkouts == null || categoryWorkouts.isEmpty()) continue;

            for (WorkoutTemplate w : categoryWorkouts) {
                if (!matchesFilters(w, minTss, maxTss, sportType, minDuration, maxDuration)) continue;

                Map<String, Object> info = new HashMap<>();
                // Build filename from originalFileName
                String filename = w.getOriginalFileName() + ".zwo";
                info.put("filename", filename);
                info.put("category", categoryName);
                info.put("name", w.getGeneratedName());
                info.put("tss", w.getEstimatedTSS());
                info.put("duration", w.getDurationMinutes());
                info.put("description", w.getDescription());
                info.put("workout_doc", w.getWorkoutDoc());
                info.put("sportType", w.getSportType());
                // zwoContent loaded on demand when scheduling, not on search
                info.put("zwoFilePath", w.getZwoFilePath());
                info.put("source", "library");
                info.put("shortDescription", w.getShortDescription());

                workouts.add(info);
            }
        }
        sortWorkouts(workouts, sortBy, sortOrder);
        return workouts;
    }

    private void loadWorkoutLibrary() {
        log.info("Loading workout library from: {}", workoutLibraryPath);
        long start = System.currentTimeMillis();
        int total = 0;
        Path path = Paths.get(workoutLibraryPath);
        if (!Files.exists(path)) { log.warn("Workout library path does not exist: {}", workoutLibraryPath); libraryLoaded = true; return; }

        try (Stream<Path> categories = Files.list(path)) {
            for (Path categoryDir : categories.filter(Files::isDirectory).sorted().collect(Collectors.toList())) {
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
                    workoutLibrary.put(categoryName, workouts);
                    total += workouts.size();
                    log.info("Loaded {} workouts for category: {}", workouts.size(), categoryName);
                }
            }
        } catch (Exception e) {
            log.error("Failed to load workout library: {}", e.getMessage(), e);
        }
        libraryLoaded = true;
        log.info("Workout library loaded: {} workouts in {}ms", total, System.currentTimeMillis() - start);
    }

    private boolean matchesFilters(WorkoutTemplate w, Integer minTss, Integer maxTss,
                                   String sportType, Integer minDuration, Integer maxDuration) {
        int tss = w.getEstimatedTSS(), duration = w.getDurationMinutes();
        boolean tssMatch = (minTss == null || maxTss == null) || (tss >= minTss && tss <= maxTss);
        boolean durMatch = (minDuration == null || maxDuration == null) || (duration >= minDuration && duration <= maxDuration);
        if (!tssMatch || !durMatch) return false;
        if (sportType != null && !sportType.isEmpty() && !"both".equalsIgnoreCase(sportType)) {
            String zwoSportType = sportType.equalsIgnoreCase("Ride") ? "bike"
                    : sportType.equalsIgnoreCase("Run") ? "run" : sportType.toLowerCase();
            return zwoSportType.equalsIgnoreCase(w.getSportType());
        }
        return true;
    }

    private void sortWorkouts(List<Map<String, Object>> workouts, String sortBy, String sortOrder) {
        if (workouts == null || workouts.isEmpty() || sortBy == null || sortBy.isEmpty()) return;
        workouts.sort((a, b) -> {
            String key = sortBy.toLowerCase().equals("category") ? "category"
                    : sortBy.toLowerCase().equals("tss") ? "tss" : "duration";
            Object av = a.get(key), bv = b.get(key);
            if (av == null && bv == null) return 0;
            if (av == null) return sortOrder.equalsIgnoreCase("asc") ? 1 : -1;
            if (bv == null) return sortOrder.equalsIgnoreCase("asc") ? -1 : 1;
            int cmp = av instanceof String ? ((String) av).compareToIgnoreCase((String) bv)
                    : Double.compare(((Number) av).doubleValue(), ((Number) bv).doubleValue());
            return sortOrder.equalsIgnoreCase("desc") ? -cmp : cmp;
        });
    }

    private String normalizeCategory(String category) {
        return Map.of("VO2Max", "VO2Max", "VO2max", "VO2Max", "Threshold", "Threshold",
                "Endurance", "Endurance", "SweetSpot", "SweetSpot", "Sweet Spot", "SweetSpot",
                "Sweetspot", "SweetSpot", "Tempo", "Tempo", "Anaerobic", "Anaerobic", "Sprint", "Sprint")
                .getOrDefault(category, category);
    }

    public String getZwoContent(String zwoFilePath, String sportType) throws Exception {
        if (zwoFilePath == null || zwoFilePath.isEmpty()) {
            throw new IllegalArgumentException("ZWO file path is required");
        }
        
        String zwoContent = Files.readString(Path.of(zwoFilePath));
        
        // Adjust sport type if needed
        if ("Running".equalsIgnoreCase(sportType) || "run".equalsIgnoreCase(sportType)) {
            zwoContent = zwoContent.replace("<sportType>bike</sportType>", "<sportType>run</sportType>");
        }
        
        return zwoContent;
    }
}
