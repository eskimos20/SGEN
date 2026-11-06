package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.GarminWorkoutPush;
import com.sgen.repository.GarminWorkoutPushRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.util.Map;

/**
 * Pushes planned workouts to the user's Garmin Connect calendar:
 * create workout (workoutportal) -> schedule (training-api).
 * Tracks each push in garmin_workout_pushes; async + fail-safe so a
 * Garmin outage never breaks event creation.
 * Starter rate limit: 100 req/min app-wide, 200 req/user/day.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminWorkoutService {

    private final com.sgen.repository.UserRepository userRepository;
    private final com.sgen.service.UserLookupService userLookupService;
    private final GarminClientFactory clientFactory;
    private final GarminWorkoutMapper workoutMapper;
    private final GarminWorkoutPushRepository pushRepository;
    private final ObjectMapper objectMapper;

    @Async
    public void scheduleWorkout(Long userId, Long calendarEventId, Integer intervalsEventId,
                                Map<String, Object> eventData, String sportKey) {
        GarminWorkoutPush push = pushRepository.findByCalendarEventId(calendarEventId)
                .orElseGet(() -> GarminWorkoutPush.builder()
                        .userId(userId).calendarEventId(calendarEventId).build());
        push.setIntervalsEventId(intervalsEventId);
        push.setWorkoutName(String.valueOf(eventData.getOrDefault("name", "SGEN Workout")));
        String dateStr = extractDate(eventData);
        push.setScheduledDate(dateStr != null ? LocalDate.parse(dateStr) : null);
        push.setStatus("PENDING");
        pushRepository.save(push);

        WebClient client = clientFactory.clientForUser(userId);
        if (client == null) {
            fail(push, "No active Garmin connection");
            return;
        }
        try {
            ObjectNode workout = workoutMapper.toGarminWorkout(userId, eventData, sportKey);
            String createdJson = client.post()
                    .uri("/workoutportal/workout/v2")
                    .bodyValue(workout.toString())
                    .retrieve().bodyToMono(String.class).block();
            JsonNode created = objectMapper.readTree(createdJson);
            String workoutId = created.path("workoutId").asText(null);
            if (workoutId == null) {
                fail(push, "No workoutId in create response: " + createdJson);
                return;
            }
            push.setGarminWorkoutId(workoutId);
            push.setStatus("CREATED");
            pushRepository.save(push);

            if (push.getScheduledDate() == null) {
                return; // workout in library only
            }
            ObjectNode sched = objectMapper.createObjectNode();
            sched.put("workoutId", Long.parseLong(workoutId));
            sched.put("date", push.getScheduledDate().toString());
            String schedJson = client.post()
                    .uri("/training-api/schedule/")
                    .bodyValue(sched.toString())
                    .retrieve().bodyToMono(String.class).block();
            JsonNode schedNode = objectMapper.readTree(schedJson);
            String scheduleId = schedNode.path("scheduleId").asText(null);
            if (scheduleId == null && schedNode.isIntegralNumber()) {
                scheduleId = schedNode.asText();
            }
            push.setGarminScheduleId(scheduleId);
            push.setStatus("SCHEDULED");
            push.setLastError(null);
            pushRepository.save(push);
            log.info("Pushed workout '{}' to Garmin for user {} on {}", push.getWorkoutName(), userId, push.getScheduledDate());
        } catch (Exception e) {
            fail(push, e.getMessage());
        }
    }

    @Async
    public void deleteWorkout(Long userId, Long calendarEventId) {
        pushRepository.findByCalendarEventId(calendarEventId).ifPresent(push -> {
            WebClient client = clientFactory.clientForUser(userId);
            try {
                if (client != null && push.getGarminScheduleId() != null) {
                    client.delete().uri("/training-api/schedule/" + push.getGarminScheduleId())
                            .retrieve().toBodilessEntity().block();
                }
                if (client != null && push.getGarminWorkoutId() != null) {
                    client.delete().uri("/training-api/workout/v2/" + push.getGarminWorkoutId())
                            .retrieve().toBodilessEntity().block();
                }
                push.setStatus("DELETED");
            } catch (Exception e) {
                push.setStatus("FAILED");
                push.setLastError(e.getMessage());
                log.warn("Garmin workout delete failed for event {}: {}", calendarEventId, e.getMessage());
            }
            pushRepository.save(push);
        });
    }

    /** Reschedule = delete old schedule + create new one for the same workout. */
    @Async
    public void reschedule(Long userId, Long calendarEventId, LocalDate newDate) {
        pushRepository.findByCalendarEventId(calendarEventId).ifPresent(push -> {
            WebClient client = clientFactory.clientForUser(userId);
            try {
                if (client != null && push.getGarminScheduleId() != null) {
                    ObjectNode upd = objectMapper.createObjectNode();
                    upd.put("scheduleId", Long.parseLong(push.getGarminScheduleId()));
                    upd.put("workoutId", Long.parseLong(push.getGarminWorkoutId()));
                    upd.put("date", newDate.toString());
                    client.put().uri("/training-api/schedule/" + push.getGarminScheduleId())
                            .bodyValue(upd.toString()).retrieve().bodyToMono(String.class).block();
                    push.setScheduledDate(newDate);
                    push.setStatus("SCHEDULED");
                }
            } catch (Exception e) {
                push.setStatus("FAILED");
                push.setLastError(e.getMessage());
            }
            pushRepository.save(push);
        });
    }

    private String extractDate(Map<String, Object> eventData) {
        Object s = eventData.get("start_date_local");
        if (s == null) return null;
        String str = s.toString();
        return str.length() >= 10 ? str.substring(0, 10) : null;
    }

    private void fail(GarminWorkoutPush push, String msg) {
        push.setStatus("FAILED");
        push.setLastError(msg != null ? msg.substring(0, Math.min(1000, msg.length())) : "unknown");
        pushRepository.save(push);
        log.warn("Garmin workout push failed for user {}: {}", push.getUserId(), msg);
    }

}
