package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.*;
import com.sgen.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Merges local Garmin data into the Intervals.icu response shapes so the
 * frontend treats both sources uniformly.
 * - Activities appended as Intervals-shaped JSON (id "garmin_<id>", source GARMIN)
 * - Dedup vs Intervals activities on start_time +-120s and duration +-10%
 * - Wellness rows overlaid onto Intervals wellness by date + local ctl/atl
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminMergeService {

    private final GarminActivityRepository activityRepository;
    private final GarminWellnessRepository wellnessRepository;
    private final UserFitnessRepository fitnessRepository;
    private final GarminWellnessViewMapper wellnessViewMapper;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /** Appends Garmin activities (deduped) to the Intervals activities array. */
    public void mergeActivities(Long userId, JsonNode activitiesNode) {
        if (!(activitiesNode instanceof ArrayNode arr)) return;
        List<GarminActivity> local = activityRepository
                .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(
                        userId, LocalDateTime.of(2000, 1, 1, 0, 0), LocalDateTime.now().plusDays(1));
        if (local.isEmpty()) return;

        for (GarminActivity a : local) {
            if (isDuplicate(arr, a)) continue;
            arr.add(toIntervalsActivityJson(a));
        }
    }

    private boolean isDuplicate(ArrayNode arr, GarminActivity a) {
        if (a.getStartTime() == null) return false;
        for (JsonNode n : arr) {
            String ds = n.path("start_date_local").asText("");
            if (ds.length() < 19) continue;
            try {
                long t = LocalDateTime.parse(ds.substring(0, 19)).toEpochSecond(ZoneOffset.UTC);
                long localT = a.getStartTime() + (a.getStartTimeOffset() != null ? a.getStartTimeOffset() : 0);
                if (Math.abs(t - localT) <= 120) {
                    double dur1 = n.path("moving_time").asDouble(n.path("elapsed_time").asDouble(0));
                    double dur2 = a.getDurationS() != null ? a.getDurationS() : 0;
                    if (dur1 <= 0 || dur2 <= 0 || Math.abs(dur1 - dur2) / Math.max(dur1, dur2) <= 0.10) {
                        return true;
                    }
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    /** GarminActivity -> Intervals.icu activity JSON shape. */
    public ObjectNode toIntervalsActivityJson(GarminActivity a) {
        ObjectNode n = objectMapper.createObjectNode();
        n.put("id", "garmin_" + a.getId());
        n.put("garmin_activity_id", a.getGarminActivityId());
        n.put("name", a.getName());
        n.put("type", toIntervalsType(a.getSportType(), a.getActivityType()));
        n.put("source", "GARMIN");
        n.put("start_date", a.getStartTime() != null
                ? Instant_at(a.getStartTime()) : null);
        n.put("start_date_local", a.getStartDateLocal() != null ? a.getStartDateLocal().format(ISO) : null);
        n.put("moving_time", a.getMovingTimeS() != null ? a.getMovingTimeS() : a.getDurationS());
        n.put("elapsed_time", a.getDurationS());
        n.put("distance", a.getDistanceM());
        n.put("calories", a.getCalories());
        n.put("average_heartrate", a.getAvgHr());
        n.put("max_heartrate", a.getMaxHr());
        n.put("average_watts", a.getAvgPower());
        n.put("max_watts", a.getMaxPower());
        n.put("average_speed", a.getAvgSpeed());
        n.put("average_cadence", a.getAvgCadence());
        n.put("total_elevation_gain", a.getElevationGain());
        n.put("total_elevation_loss", a.getElevationLoss());
        n.put("icu_training_load", a.getTrainingLoad());
        n.put("device_name", a.getDeviceName());
        n.put("external_id", String.valueOf(a.getGarminActivityId()));
        return n;
    }

    private String Instant_at(long epoch) {
        return java.time.Instant.ofEpochSecond(epoch).toString();
    }

    private String toIntervalsType(String sportType, String activityType) {
        if (sportType != null) {
            return switch (sportType) {
                case "run" -> "Run";
                case "ride" -> "Ride";
                case "swim" -> "Swim";
                case "walk" -> "Walk";
                default -> "Workout";
            };
        }
        return "Workout";
    }

    /**
     * Merges Garmin wellness fields into the Intervals wellness list.
     * Garmin fills missing fields only; locally computed ctl/atl/rampRate
     * always overlay (Intervals CTL can not see Garmin load).
     */
    public List<Map<String, Object>> mergeWellness(Long userId, List<Map<String, Object>> intervalsWellness) {
        List<GarminWellness> rows = wellnessRepository.findByUserIdAndSummaryDateBetween(
                userId, LocalDate.of(2000, 1, 1), LocalDate.now().plusDays(1));
        List<UserFitness> fitness = fitnessRepository.findByUserIdAndFitnessDateBetweenOrderByFitnessDateAsc(
                userId, LocalDate.of(2000, 1, 1), LocalDate.now().plusDays(1));

        Map<String, Map<String, Object>> byDate = new LinkedHashMap<>();
        for (Map<String, Object> w : intervalsWellness) {
            String id = String.valueOf(w.getOrDefault("id", ""));
            if (!id.isEmpty()) byDate.put(id, new HashMap<>(w));
        }
        for (GarminWellness row : rows) {
            if (row.getSummaryDate() == null) continue;
            String d = row.getSummaryDate().toString();
            Map<String, Object> target = byDate.computeIfAbsent(d, k -> {
                Map<String, Object> fresh = new HashMap<>();
                fresh.put("id", d);
                return fresh;
            });
            wellnessViewMapper.toIntervalsFields(row).forEach((k, v) -> target.putIfAbsent(k, v));
        }
        for (UserFitness f : fitness) {
            Map<String, Object> target = byDate.get(f.getFitnessDate().toString());
            if (target == null) continue;
            target.put("ctl", round1(f.getCtl()));
            target.put("atl", round1(f.getAtl()));
            target.put("rampRate", f.getRampRate() != null ? f.getRampRate() : 0);
        }
        return new ArrayList<>(byDate.values());
    }

    private double round1(double v) { return Math.round(v * 10.0) / 10.0; }
}
