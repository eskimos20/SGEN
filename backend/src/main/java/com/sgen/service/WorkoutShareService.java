package com.sgen.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.entity.WorkoutShare;
import com.sgen.exception.NotFoundException;
import com.sgen.model.WorkoutTemplate;
import com.sgen.repository.UserRepository;
import com.sgen.repository.WorkoutShareRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkoutShareService {

    private final WorkoutShareRepository workoutShareRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final IntervalsEventService intervalsEventService;
    private final CalendarEventService calendarEventService;
    private final ZwoParser zwoParser;
    private final CustomWorkoutService customWorkoutService;

    private static final String CUSTOM_LIBRARY_BASE = "./custom-workout-library/";
    private static final String WORKOUT_LIBRARY_BASE = "./workout-library/";

    private static class TargetFiles {
        final Path zwo;
        final Path json;
        final boolean created;
        final Map<String, Object> meta;

        TargetFiles(Path zwo, Path json, boolean created, Map<String, Object> meta) {
            this.zwo = zwo;
            this.json = json;
            this.created = created;
            this.meta = meta;
        }
    }

    public List<User> findSharableUsers() {
        return userRepository.findByShareWorkoutsEnabledTrue();
    }

    @Transactional
    public List<WorkoutShare> shareWorkout(String fromUsername, ShareRequest request) throws Exception {
        List<String> targetUsernames = request.getToUsernames();
        if (targetUsernames == null || targetUsernames.isEmpty()) {
            throw new IllegalArgumentException("No target users selected");
        }

        Path sourcePath = resolveSourcePath(fromUsername, request.getSourcePath());
        if (!Files.exists(sourcePath) || !Files.isRegularFile(sourcePath)) {
            throw new NotFoundException("Workout file not found: " + request.getSourcePath());
        }

        List<WorkoutShare> shares = new ArrayList<>();
        for (String toUsername : targetUsernames) {
            User targetUser = userRepository.findByUsername(toUsername)
                    .orElseThrow(() -> new NotFoundException("User not found: " + toUsername));
            if (Boolean.FALSE.equals(targetUser.getShareWorkoutsEnabled())) {
                continue;
            }
            WorkoutShare share = WorkoutShare.builder()
                    .fromUsername(fromUsername)
                    .toUsername(toUsername)
                    .workoutName(request.getWorkoutName())
                    .category(request.getCategory())
                    .tss(request.getTss())
                    .sourcePath(sourcePath.toString())
                    .status(WorkoutShare.Status.PENDING)
                    .scheduledDate(request.getScheduledDate())
                    .build();
            shares.add(workoutShareRepository.save(share));
            log.info("User {} shared workout {} with {}", fromUsername, request.getWorkoutName(), toUsername);
        }

        // Also schedule on the sharer's own calendar if requested (no extra file copy)
        if (Boolean.TRUE.equals(request.isAddToOwnerCalendar())
                && request.getScheduledDate() != null && !request.getScheduledDate().isBlank()) {
            try {
                scheduleWorkoutOnIntervals(fromUsername, sourcePath, request.getWorkoutName(),
                        request.getCategory(), request.getTss(), request.getScheduledDate());
            } catch (Exception e) {
                log.error("Failed to schedule shared workout on owner calendar for {}: {}", fromUsername, e.getMessage(), e);
            }
        }

        return shares;
    }

    public List<Map<String, Object>> getPendingShares(String toUsername) {
        List<WorkoutShare> shares = workoutShareRepository.findByToUsernameAndStatus(toUsername, WorkoutShare.Status.PENDING);
        return shares.stream().map(share -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("id", share.getId());
            dto.put("fromUsername", share.getFromUsername());
            dto.put("workoutName", share.getWorkoutName());
            dto.put("category", share.getCategory());
            dto.put("tss", share.getTss());
            dto.put("scheduledDate", share.getScheduledDate());
            dto.put("status", share.getStatus().name());
            dto.put("createdAt", share.getCreatedAt());
            try {
                Path sourcePath = Paths.get(share.getSourcePath());
                WorkoutTemplate workout = zwoParser.parse(sourcePath, share.getCategory());
                if (workout != null) {
                    dto.put("sportType", workout.getSportType());
                    dto.put("duration", workout.getDurationMinutes());
                    dto.put("description", workout.getDescription());
                    dto.put("shortDescription", workout.getShortDescription());
                    if (workout.getWorkoutDoc() != null) {
                        dto.put("workout_doc", workout.getWorkoutDoc());
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse source ZWO for share {}: {}", share.getId(), e.getMessage());
            }
            return dto;
        }).toList();
    }

    @Transactional
    public WorkoutShare acceptShare(Long shareId, String toUsername) throws Exception {
        WorkoutShare share = workoutShareRepository.findById(shareId)
                .orElseThrow(() -> new NotFoundException("Share not found"));
        if (!share.getToUsername().equals(toUsername)) {
            throw new SecurityException("Not authorized to accept this share");
        }
        if (share.getStatus() != WorkoutShare.Status.PENDING) {
            throw new IllegalStateException("Share is not pending");
        }

        Path sourcePath = Paths.get(share.getSourcePath());
        Path sourceJsonPath = getJsonPath(sourcePath);

        TargetFiles targetFiles = findOrCreateTargetFiles(share, toUsername, sourcePath, sourceJsonPath);
        Path targetZwo = targetFiles.zwo;
        Map<String, Object> meta = targetFiles.meta;
        String filename = targetZwo.getFileName().toString();

        // Force reload of the recipient's custom workout library so the new files are searchable
        customWorkoutService.invalidateUserCache(toUsername);

        // Schedule the workout on Intervals.icu if a date is provided
        JsonNode createdEvent = null;
        if (share.getScheduledDate() != null && !share.getScheduledDate().isBlank()) {
            try {
                String zwoContent = Files.readString(targetZwo);
                Map<String, Object> eventData = buildEventPayload(share.getWorkoutName(), share.getTss(),
                        share.getScheduledDate(), meta, zwoContent, filename);
                createdEvent = intervalsEventService.createEvent(toUsername, eventData);

                // Save calendar event deload status locally
                try {
                    Map<String, Object> eventWithId = new java.util.HashMap<>(eventData);
                    if (createdEvent != null && createdEvent.has("id")) {
                        eventWithId.put("id", createdEvent.get("id").asInt());
                    }
                    calendarEventService.saveCalendarEvents(toUsername, List.of(eventWithId));
                } catch (Exception e) {
                    log.warn("Failed to save local calendar event: {}", e.getMessage());
                }
            } catch (Exception e) {
                log.error("Failed to schedule shared workout for {}: {}", toUsername, e.getMessage(), e);
                // Still accept the share so user keeps the copied file
            }
        }

        share.setStatus(WorkoutShare.Status.ACCEPTED);
        return workoutShareRepository.save(share);
    }

    private Map<String, Object> buildEventPayload(String workoutName, Integer tss,
                                                   String scheduledDate, Map<String, Object> meta,
                                                   String zwoContent, String filename) {
        Object workoutDoc = meta != null ? meta.get("workout_doc") : null;
        if (workoutName == null && meta != null && meta.get("name") != null) {
            workoutName = meta.get("name").toString();
        }
        Integer duration = null;
        if (meta != null && meta.get("duration") instanceof Number) {
            duration = ((Number) meta.get("duration")).intValue();
        }
        if (duration == null && meta != null && meta.get("duration") instanceof String) {
            try {
                duration = Integer.parseInt((String) meta.get("duration"));
            } catch (NumberFormatException ignored) {}
        }

        String startDate = scheduledDate != null && scheduledDate.contains("T") ? scheduledDate : scheduledDate + "T00:00:00";

        String sportType = meta != null && meta.get("sportType") != null ? meta.get("sportType").toString() : "bike";
        boolean isRun = sportType.equalsIgnoreCase("run") || sportType.equalsIgnoreCase("running");
        String intervalsType = isRun ? "Run" : "Ride";
        String intervalsSportType = isRun ? "Run" : "Ride";

        if (isRun && zwoContent != null) {
            zwoContent = zwoContent.replace("<sportType>bike</sportType>", "<sportType>run</sportType>");
        }

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("start_date_local", startDate);
        payload.put("name", workoutName);
        payload.put("description", meta != null && meta.get("description") != null ? meta.get("description") : "");
        payload.put("type", intervalsType);
        payload.put("category", "WORKOUT");
        payload.put("moving_time", duration != null ? duration * 60 : 0);
        payload.put("icu_training_load", tss != null ? tss : 0);
        payload.put("indoor", true);
        payload.put("file_contents", zwoContent);
        payload.put("filename", filename);

        ObjectNode finalWorkoutDoc;
        if (workoutDoc instanceof ObjectNode) {
            finalWorkoutDoc = (ObjectNode) ((ObjectNode) workoutDoc).deepCopy();
        } else {
            finalWorkoutDoc = objectMapper.createObjectNode();
        }
        finalWorkoutDoc.put("sport_type", intervalsSportType);
        payload.put("workout_doc", finalWorkoutDoc);

        return payload;
    }

    @Transactional
    public WorkoutShare declineShare(Long shareId, String toUsername) {
        WorkoutShare share = workoutShareRepository.findById(shareId)
                .orElseThrow(() -> new NotFoundException("Share not found"));
        if (!share.getToUsername().equals(toUsername)) {
            throw new SecurityException("Not authorized to decline this share");
        }
        share.setStatus(WorkoutShare.Status.DECLINED);
        return workoutShareRepository.save(share);
    }

    private TargetFiles findOrCreateTargetFiles(WorkoutShare share, String toUsername, Path sourcePath, Path sourceJsonPath) throws Exception {
        Path targetCategoryPath = Paths.get(CUSTOM_LIBRARY_BASE + toUsername).resolve(share.getCategory());
        Files.createDirectories(targetCategoryPath);

        String baseFilename = share.getCategory() + "_TSS_" + (share.getTss() != null ? share.getTss() : "Shared");
        String sourceContent = Files.readString(sourcePath).trim();

        Path[] existing;
        try (java.util.stream.Stream<Path> stream = Files.list(targetCategoryPath)
                .filter(p -> p.getFileName().toString().toLowerCase().startsWith(baseFilename.toLowerCase())
                        && p.getFileName().toString().toLowerCase().endsWith(".zwo"))
                .sorted()) {
            existing = stream.toArray(Path[]::new);
        }

        for (Path candidate : existing) {
            if (Files.readString(candidate).trim().equals(sourceContent)) {
                log.info("Found identical existing workout for {}: {}", toUsername, candidate.getFileName());
                Path candidateJson = getJsonPath(candidate);
                Map<String, Object> existingMeta = createTargetMetadata(share, candidate, sourceJsonPath);
                return new TargetFiles(candidate, candidateJson, false, existingMeta);
            }
        }

        int version = 1;
        Path targetZwo;
        do {
            String filename = baseFilename + "_v" + version + ".zwo";
            targetZwo = targetCategoryPath.resolve(filename);
            version++;
        } while (Files.exists(targetZwo));

        Files.copy(sourcePath, targetZwo);
        log.info("Copied shared ZWO to {}", targetZwo);

        Path targetJson = targetCategoryPath.resolve(targetZwo.getFileName().toString().replace(".zwo", ".json"));
        Map<String, Object> meta = createTargetMetadata(share, targetZwo, sourceJsonPath);
        Files.writeString(targetJson, objectMapper.writeValueAsString(meta));
        log.info("Wrote shared JSON metadata to {}", targetJson);

        return new TargetFiles(targetZwo, targetJson, true, meta);
    }

    private Map<String, Object> createTargetMetadata(WorkoutShare share, Path targetZwo, Path sourceJsonPath) {
        Map<String, Object> meta = new LinkedHashMap<>();
        try {
            if (Files.exists(sourceJsonPath)) {
                Map<String, Object> sourceMeta = objectMapper.readValue(Files.readString(sourceJsonPath), new TypeReference<>() {});
                if (sourceMeta != null) {
                    meta.putAll(sourceMeta);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to read source JSON {}: {}", sourceJsonPath, e.getMessage());
        }

        try {
            WorkoutTemplate workout = zwoParser.parse(targetZwo, share.getCategory());
            if (workout != null) {
                if (workout.getWorkoutDoc() != null) {
                    meta.put("workout_doc", workout.getWorkoutDoc());
                }
                Integer tss = share.getTss() != null ? share.getTss() : workout.getEstimatedTSS();
                if (tss != null && tss > 0) {
                    meta.put("tss", tss);
                }
                if (workout.getDurationMinutes() > 0) {
                    meta.put("duration", workout.getDurationMinutes());
                }
                if (workout.getDescription() != null && !workout.getDescription().isBlank()) {
                    meta.put("description", workout.getDescription());
                }
                if (workout.getShortDescription() != null && !workout.getShortDescription().isBlank()) {
                    meta.put("shortDescription", workout.getShortDescription());
                }
                if (workout.getSportType() != null && !workout.getSportType().isBlank()) {
                    meta.put("sportType", workout.getSportType());
                }
                if (share.getWorkoutName() != null && !share.getWorkoutName().isBlank()) {
                    meta.put("name", share.getWorkoutName());
                } else if (workout.getGeneratedName() != null) {
                    meta.put("name", workout.getGeneratedName());
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse target ZWO {}: {}", targetZwo, e.getMessage());
            // Ensure minimal metadata still exists
            if (share.getTss() != null) meta.put("tss", share.getTss());
            if (share.getWorkoutName() != null) meta.put("name", share.getWorkoutName());
        }

        meta.put("sharedBy", share.getFromUsername());
        meta.put("sharedAt", share.getCreatedAt() != null ? share.getCreatedAt().toString() : null);
        return meta;
    }

    private void scheduleWorkoutOnIntervals(String username, Path zwoPath, String workoutName,
                                             String category, Integer tss, String scheduledDate) throws Exception {
        String zwoContent = Files.readString(zwoPath);
        WorkoutTemplate workout = zwoParser.parse(zwoPath, category);

        Map<String, Object> meta = new LinkedHashMap<>();
        if (workout != null) {
            if (workout.getWorkoutDoc() != null) meta.put("workout_doc", workout.getWorkoutDoc());
            meta.put("duration", workout.getDurationMinutes());
            if (workout.getDescription() != null && !workout.getDescription().isBlank()) {
                meta.put("description", workout.getDescription());
            }
            if (workout.getShortDescription() != null && !workout.getShortDescription().isBlank()) {
                meta.put("shortDescription", workout.getShortDescription());
            }
            meta.put("sportType", workout.getSportType());
            if (workoutName == null || workoutName.isBlank()) {
                workoutName = workout.getGeneratedName();
            }
            if (tss == null || tss == 0) {
                tss = workout.getEstimatedTSS();
            }
        }
        meta.put("name", workoutName);

        String filename = zwoPath.getFileName().toString();
        Map<String, Object> eventData = buildEventPayload(workoutName, tss, scheduledDate, meta, zwoContent, filename);
        JsonNode createdEvent = intervalsEventService.createEvent(username, eventData);

        try {
            Map<String, Object> eventWithId = new java.util.HashMap<>(eventData);
            if (createdEvent != null && createdEvent.has("id")) {
                eventWithId.put("id", createdEvent.get("id").asInt());
            }
            calendarEventService.saveCalendarEvents(username, List.of(eventWithId));
        } catch (Exception e) {
            log.warn("Failed to save local calendar event for {}: {}", username, e.getMessage());
        }
    }

    private Path resolveSourcePath(String fromUsername, String sourcePath) {
        Path path = Paths.get(sourcePath).toAbsolutePath().normalize();
        // Allow either workout-library (global) or custom-workout-library/<username> paths
        Path workoutLibraryBase = Paths.get(WORKOUT_LIBRARY_BASE).toAbsolutePath().normalize();
        Path customLibraryBase = Paths.get(CUSTOM_LIBRARY_BASE).toAbsolutePath().normalize();
        Path userCustomBase = customLibraryBase.resolve(fromUsername).toAbsolutePath().normalize();

        if (path.startsWith(workoutLibraryBase) || path.startsWith(userCustomBase)) {
            return path;
        }
        throw new SecurityException("Invalid source path: " + sourcePath);
    }

    private Path getJsonPath(Path zwoPath) {
        String jsonName = zwoPath.getFileName().toString().replace(".zwo", ".json");
        return zwoPath.getParent().resolve(jsonName);
    }

    public static class ShareRequest {
        private List<String> toUsernames;
        private String sourcePath;
        private String workoutName;
        private String category;
        private Integer tss;
        private String scheduledDate;
        private boolean addToOwnerCalendar;

        public List<String> getToUsernames() { return toUsernames; }
        public void setToUsernames(List<String> toUsernames) { this.toUsernames = toUsernames; }
        public String getSourcePath() { return sourcePath; }
        public void setSourcePath(String sourcePath) { this.sourcePath = sourcePath; }
        public String getWorkoutName() { return workoutName; }
        public void setWorkoutName(String workoutName) { this.workoutName = workoutName; }
        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }
        public Integer getTss() { return tss; }
        public void setTss(Integer tss) { this.tss = tss; }
        public String getScheduledDate() { return scheduledDate; }
        public void setScheduledDate(String scheduledDate) { this.scheduledDate = scheduledDate; }
        public boolean isAddToOwnerCalendar() { return addToOwnerCalendar; }
        public void setAddToOwnerCalendar(boolean addToOwnerCalendar) { this.addToOwnerCalendar = addToOwnerCalendar; }
    }
}
