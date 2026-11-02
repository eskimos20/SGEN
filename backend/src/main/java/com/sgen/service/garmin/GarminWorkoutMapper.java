package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Converts an SGEN event payload (Intervals workout_doc, ZWO-derived)
 * to Garmin Training API v2 workout JSON (segments model).
 *
 * workout_doc step format:
 *   {duration(s), power:{units:"%ftp", value|start|end},
 *    until_lap_press?, reps?, steps:[nested on/off]}
 * Garmin step format:
 *   WorkoutStep{type,stepOrder,intensity,durationType,durationValue,
 *               targetType,targetValueLow/High,description}
 *   WorkoutRepeatStep{repeatType:REPEAT_UNTIL_STEPS_CMPLT,repeatValue,steps:[...]}
 *
 * Targets are sent as absolute watts when user FTP is known
 * (PERCENT semantics are ambiguous in the spec); otherwise OPEN.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminWorkoutMapper {

    private final ObjectMapper objectMapper;
    private final GarminSportSettingsService sportSettings;

    /** eventData: {name, description, type:'Ride'|'Run', workout_doc:{steps:[...]}} */
    public ObjectNode toGarminWorkout(Long userId, Map<String, Object> eventData, String sportKey) {
        Double ftp = "ride".equals(sportKey) ? sportSettings.ftpWatts(userId, "ride") : null;

        ObjectNode workout = objectMapper.createObjectNode();
        String name = String.valueOf(eventData.getOrDefault("name", "SGEN Workout"));
        workout.put("workoutName", name.length() > 255 ? name.substring(0, 255) : name);
        String desc = String.valueOf(eventData.getOrDefault("description", ""));
        workout.put("description", desc.length() > 1024 ? desc.substring(0, 1024) : desc);
        workout.put("sport", "run".equals(sportKey) ? "RUNNING" : "CYCLING");
        workout.put("workoutProvider", "SGEN");
        workout.put("workoutSourceId", "SGEN");
        workout.put("isSessionTransitionEnabled", false);

        ObjectNode segment = objectMapper.createObjectNode();
        segment.put("segmentOrder", 1);
        segment.put("sport", workout.get("sport").asText());
        segment.putNull("poolLength");
        segment.putNull("poolLengthUnit");

        ArrayNode steps = segment.putArray("steps");
        JsonNode doc = eventData.get("workout_doc") != null
                ? objectMapper.valueToTree(eventData.get("workout_doc")) : null;
        JsonNode srcSteps = doc != null ? doc.get("steps") : null;
        int[] order = {0};
        int total = srcSteps != null && srcSteps.isArray() ? srcSteps.size() : 0;
        if (srcSteps != null && srcSteps.isArray()) {
            for (int i = 0; i < srcSteps.size(); i++) {
                appendStep(steps, srcSteps.get(i), order, i == 0, i == total - 1, ftp, total);
            }
        }
        if (steps.size() == 0) {
            // Fallback: single open-ended step so the workout is valid
            steps.add(step("WorkoutStep", order, "ACTIVE", "OPEN", null, null, null, null, null));
        }
        segment.set("steps", steps);
        workout.putArray("segments").add(segment);
        return workout;
    }

    private void appendStep(ArrayNode out, JsonNode step, int[] order,
                            boolean isFirst, boolean isLast, Double ftp, int total) {
        if (step.has("reps") && step.has("steps")) {
            ObjectNode repeat = objectMapper.createObjectNode();
            repeat.put("type", "WorkoutRepeatStep");
            repeat.put("stepOrder", ++order[0]);
            repeat.put("repeatType", "REPEAT_UNTIL_STEPS_CMPLT");
            repeat.put("repeatValue", step.get("reps").asInt());
            ArrayNode nested = repeat.putArray("steps");
            JsonNode inner = step.get("steps");
            for (int i = 0; i < inner.size(); i++) {
                JsonNode s = inner.get(i);
                boolean on = i % 2 == 0; // ZWO IntervalsT: [on, off] pairs
                appendSingle(nested, s, order,
                        on ? "INTERVAL" : "RECOVERY", ftp);
            }
            out.add(repeat);
            return;
        }
        String intensity = isFirst && total > 1 ? "WARMUP"
                : isLast && total > 1 ? "COOLDOWN" : "ACTIVE";
        appendSingle(out, step, order, intensity, ftp);
    }

    private void appendSingle(ArrayNode out, JsonNode s, int[] order, String intensity, Double ftp) {
        boolean lapPress = s.path("until_lap_press").asBoolean(false);
        Integer duration = s.has("duration") ? s.get("duration").asInt() : null;

        Double low = null, high = null;
        JsonNode power = s.get("power");
        String target = null;
        if (power != null && ftp != null) {
            if (power.has("value")) {
                double w = power.get("value").asDouble() * ftp / 100.0;
                low = w * 0.95; high = w * 1.05; // +-5% band around target
            } else if (power.has("start") && power.has("end")) {
                low = power.get("start").asDouble() * ftp / 100.0;
                high = power.get("end").asDouble() * ftp / 100.0;
                if (low > high) { double t = low; low = high; high = t; }
            }
            if (low != null) target = "POWER";
        } else if (power != null && power.has("value")) {
            // No FTP known: send zone-less open target rather than wrong watts
            target = null;
        }

        out.add(step("WorkoutStep", order, intensity,
                lapPress ? "OPEN" : "TIME",
                lapPress ? null : duration,
                target, low, high, s.path("text").asText(null)));
    }

    private ObjectNode step(String type, int[] order, String intensity,
                            String durationType, Integer durationValue,
                            String targetType, Double low, Double high, String description) {
        ObjectNode n = objectMapper.createObjectNode();
        n.put("type", type);
        n.put("stepOrder", ++order[0]);
        n.put("intensity", intensity);
        if (description != null) n.put("description", description.length() > 512 ? description.substring(0, 512) : description);
        n.put("durationType", durationType);
        if (durationValue != null) n.put("durationValue", durationValue); else n.putNull("durationValue");
        n.putNull("durationValueType");
        n.put("targetType", targetType != null ? targetType : "OPEN");
        n.putNull("targetValue");
        if (low != null) n.put("targetValueLow", Math.round(low)); else n.putNull("targetValueLow");
        if (high != null) n.put("targetValueHigh", Math.round(high)); else n.putNull("targetValueHigh");
        n.putNull("targetValueType");
        return n;
    }
}
