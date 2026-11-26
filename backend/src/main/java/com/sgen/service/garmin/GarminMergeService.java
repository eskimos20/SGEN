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
import java.util.stream.Collectors;

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
    private final UserDailyLoadRepository dailyLoadRepository;
    private final GarminWellnessViewMapper wellnessViewMapper;
    private final UserRepository userRepository;
    private final com.sgen.service.UserLookupService userLookupService;
    private final ObjectMapper objectMapper;

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /**
     * Local Garmin data wins: Intervals activities that match a stored
     * Garmin activity are removed, then all local activities are appended.
     * Intervals is fallback for Garmin data not yet in the DB; other
     * brands (Suunto/Polar/etc.) always come from Intervals untouched.
     */
    public void mergeActivities(Long userId, JsonNode activitiesNode) {
        if (!(activitiesNode instanceof ArrayNode arr)) return;
        List<GarminActivity> local = activityRepository
                .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(
                        userId, LocalDateTime.of(2000, 1, 1, 0, 0), LocalDateTime.now().plusDays(1))
                .stream()
                // MoveIQ auto-detected items are not real activities — the watch
                // often duplicates a recorded session (e.g. ski flagged as swim)
                // and neither Garmin Connect nor Intervals counts them as volume.
                .filter(a -> !Boolean.TRUE.equals(a.getManual()))
                .collect(Collectors.toList());
        if (local.isEmpty()) return;

        // Remove Intervals copies of activities we hold locally
        int removed = 0;
        for (int i = arr.size() - 1; i >= 0; i--) {
            if (isDuplicateOfLocal(local, arr.get(i))) { arr.remove(i); removed++; }
        }
        for (GarminActivity a : local) {
            arr.add(toIntervalsActivityJson(a));
        }
        // Keep the feed newest-first — appended local rows would otherwise
        // land at the bottom regardless of date.
        var sorted = new ArrayList<JsonNode>();
        arr.forEach(sorted::add);
        sorted.sort((x, y) -> y.path("start_date_local").asText("")
                .compareTo(x.path("start_date_local").asText("")));
        arr.removeAll();
        sorted.forEach(arr::add);
        log.debug("Garmin merge for user {}: {} local activities served from DB, {} Intervals duplicates suppressed",
                userId, local.size(), removed);
    }

    /** True if an Intervals-feed activity matches any stored Garmin activity (start +-120s, duration +-10%). */
    public boolean isDuplicateOfLocal(List<GarminActivity> local, JsonNode intervalsActivity) {
        return findLocalMatch(local, intervalsActivity) != null;
    }

    /** The stored Garmin activity matching an Intervals-feed activity, or null. */
    private GarminActivity findLocalMatch(List<GarminActivity> local, JsonNode intervalsActivity) {
        String ds = intervalsActivity.path("start_date_local").asText("");
        if (ds.length() < 19) return null;
        long t;
        try {
            t = LocalDateTime.parse(ds.substring(0, 19)).toEpochSecond(ZoneOffset.UTC);
        } catch (Exception e) { return null; }
        double dur1 = intervalsActivity.path("moving_time").asDouble(
                intervalsActivity.path("elapsed_time").asDouble(0));
        for (GarminActivity a : local) {
            if (a.getStartTime() == null) continue;
            // startTime is UTC epoch; compare local time (start + offset).
            long localT = a.getStartTime() + (a.getStartTimeOffset() != null ? a.getStartTimeOffset() : 0);
            if (Math.abs(t - localT) > 120) continue;
            double dur2 = a.getDurationS() != null ? a.getDurationS() : 0;
            if (dur1 <= 0 || dur2 <= 0 || Math.abs(dur1 - dur2) / Math.max(dur1, dur2) <= 0.10) {
                return a;
            }
        }
        return null;
    }

    private void copyField(JsonNode from, ObjectNode to, String field) {
        JsonNode v = from.get(field);
        if (v != null && !v.isNull()) to.set(field, v);
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
        // A user-picked type (icu_type) always wins — otherwise map the
        // Garmin activity_type enum onto Intervals' activity types.
        n.put("type", a.getIcuType() != null && !a.getIcuType().isBlank()
                ? a.getIcuType()
                : toIntervalsType(a.getSportType(), a.getActivityType()));
        n.put("source", "GARMIN");
        n.put("start_date", a.getStartTime() != null
                ? Instant_at(a.getStartTime()) : null);
        n.put("start_date_local", a.getStartDateLocal() != null ? a.getStartDateLocal().format(ISO) : null);
        // Garmin's moving duration excludes auto-pause/short stops that
        // Intervals counts in moving_time — use the larger so volume totals
        // match what Intervals.icu shows for the same session.
        int moving = a.getMovingTimeS() != null ? a.getMovingTimeS() : 0;
        int dur = a.getDurationS() != null ? a.getDurationS() : 0;
        n.put("moving_time", Math.max(moving, dur));
        n.put("elapsed_time", a.getDurationS());
        n.put("distance", a.getDistanceM());
        n.put("calories", a.getCalories());
        n.put("average_heartrate", a.getAvgHr());
        n.put("max_heartrate", a.getMaxHr());
        n.put("average_watts", a.getAvgPower());
        n.put("max_watts", a.getMaxPower());
        n.put("average_speed", a.getAvgSpeed());
        // Intervals-format pace (m/s) — needed for pace display on pace sports
        // (skiing etc.) where Intervals derives it from average_speed.
        Double pace = a.getAvgSpeed();
        int moveSecs = Math.max(moving, dur);
        if ((pace == null || pace <= 0) && a.getDistanceM() != null && a.getDistanceM() > 0 && moveSecs > 0) {
            pace = a.getDistanceM() / moveSecs;
        }
        n.put("pace", pace);
        n.put("average_cadence", a.getAvgCadence());
        n.put("total_elevation_gain", a.getElevationGain());
        n.put("total_elevation_loss", a.getElevationLoss());
        n.put("icu_training_load", a.getTrainingLoad());
        n.put("icu_rpe", a.getRpe());
        n.put("feel", a.getFeel());
        n.put("description", a.getDescription());
        n.put("device_name", a.getDeviceName());
        n.put("external_id", String.valueOf(a.getGarminActivityId()));
        return n;
    }

    private String Instant_at(long epoch) {
        return java.time.Instant.ofEpochSecond(epoch).toString();
    }

    private String toIntervalsType(String sportType, String activityType) {
        String mapped = mapGarminActivityType(activityType);
        if (mapped != null) return mapped;
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
     * Garmin Health API summary activityType enum -> Intervals.icu activity type.
     * Covers the full Health API enum (Appendix A of the REST spec). Values with
     * no meaningful Intervals counterpart return null and fall back to the
     * generic sport_type mapping.
     */
    private String mapGarminActivityType(String activityType) {
        if (activityType == null) return null;
        return switch (activityType) {
            // Running
            case "RUNNING", "STREET_RUNNING", "TRACK_RUNNING", "ULTRA_RUN", "OBSTACLE_RUN",
                 "TREADMILL_RUNNING", "INDOOR_RUNNING" -> "Run";
            case "TRAIL_RUNNING" -> "TrailRun";
            case "VIRTUAL_RUN" -> "VirtualRun";
            // Cycling
            case "CYCLING", "ROAD_BIKING", "BMX", "RECUMBENT_CYCLING", "INDOOR_CYCLING" -> "Ride";
            case "TRACK_CYCLING" -> "TrackRide";
            case "MOUNTAIN_BIKING", "DOWNHILL_BIKING" -> "MountainBikeRide";
            case "GRAVEL_CYCLING", "CYCLOCROSS" -> "GravelRide";
            case "E_BIKE_FITNESS", "E_BIKE_RIDING" -> "EBikeRide";
            case "E_BIKE_MOUNTAIN", "E_MOUNTAIN_BIKING" -> "EMountainBikeRide";
            case "VIRTUAL_RIDE" -> "VirtualRide";
            case "HANDCYCLING", "INDOOR_HANDCYCLING" -> "Handcycle";
            // Swimming
            case "SWIMMING", "LAP_SWIMMING", "POOL_SWIMMING" -> "Swim";
            case "OPEN_WATER_SWIMMING" -> "OpenWaterSwim";
            case "SNORKELING" -> "Swim";
            // Walking / hiking
            case "WALKING", "CASUAL_WALKING", "SPEED_WALKING" -> "Walk";
            case "HIKING", "MOUNTAINEERING" -> "Hike";
            // Winter sports
            case "CROSS_COUNTRY_SKIING", "CROSS_COUNTRY_SKIING_WS", "SKATE_SKIING",
                 "SKATE_SKIING_WS" -> "NordicSki";
            case "BACKCOUNTRY_SKIING_SNOWBOARDING", "BACKCOUNTRY_SKIING_SNOWBOARDING_WS",
                 "BACKCOUNTRY_SKIING" -> "BackcountrySki";
            case "BACKCOUNTRY_SNOWBOARDING", "SNOWBOARDING_WS" -> "Snowboard";
            case "RESORT_SKIING_SNOWBOARDING", "RESORT_SKIING_SNOWBOARDING_WS",
                 "RESORT_SKIING" -> "AlpineSki";
            case "SNOW_SHOE", "SNOW_SHOE_WS" -> "Snowshoe";
            case "SKATING", "SKATING_WS", "ICE_SKATING" -> "IceSkate";
            case "INLINE_SKATING" -> "InlineSkate";
            case "ROLLER_SKI" -> "RollerSki";
            // Gym / fitness
            case "STRENGTH_TRAINING" -> "WeightTraining";
            case "HIIT" -> "HighIntensityIntervalTraining";
            case "ELLIPTICAL" -> "Elliptical";
            case "STAIR_CLIMBING", "FLOOR_CLIMBING" -> "StairStepper";
            case "FITNESS_EQUIPMENT", "INDOOR_CARDIO", "BOXING", "MIXED_MARTIAL_ARTS",
                 "BREATHWORK" -> "Workout";
            case "YOGA" -> "Yoga";
            case "PILATES" -> "Pilates";
            // Water sports
            case "ROWING", "ROWING_V2", "INDOOR_ROWING", "INDOOR_ROWING_V2" -> "Rowing";
            case "KAYAKING", "KAYAKING_V2" -> "Kayaking";
            case "STAND_UP_PADDLEBOARDING", "STAND_UP_PADDLEBOARDING_V2", "SUP" -> "StandUpPaddling";
            case "SURFING", "SURFING_V2" -> "Surfing";
            case "WINDSURFING", "WINDSURFING_V2" -> "Windsurf";
            case "KITEBOARDING", "KITEBOARDING_V2", "WIND_KITE_SURFING" -> "Kitesurf";
            case "SAILING", "SAILING_V2", "OFFSHORE_GRINDING", "OFFSHORE_GRINDING_V2",
                 "ONSHORE_GRINDING", "ONSHORE_GRINDING_V2" -> "Sail";
            case "PADDLING", "PADDLING_V2", "WAKEBOARDING", "WAKEBOARDING_V2", "WATERSKIING",
                 "WATER_SPORTS", "WHITEWATER_RAFTING_KAYAKING", "WHITEWATER_RAFTING_V2" -> "WaterSport";
            // Racket / team sports
            case "TENNIS", "TENNIS_V2", "PLATFORM_TENNIS" -> "Tennis";
            case "PADEL" -> "Padel";
            case "PICKLEBALL" -> "Pickleball";
            case "SQUASH" -> "Squash";
            case "RACQUTBALL" -> "Racquetball";
            case "BADMINTON" -> "Badminton";
            case "TABLE_TENNIS" -> "TableTennis";
            case "SOCCER" -> "Soccer";
            case "FIELD_HOCKEY", "ICE_HOCKEY" -> "Hockey";
            case "RUGBY" -> "Rugby";
            // Other mapped
            case "GOLF" -> "Golf";
            case "BOULDERING", "INDOOR_CLIMBING", "ROCK_CLIMBING" -> "RockClimbing";
            case "WHEELCHAIR_PUSH_RUN", "WHEELCHAIR_PUSH_WALK" -> "Wheelchair";
            case "BIKE_TO_RUN_TRANSITION_V2", "BIKETORUNTRANSITION",
                 "RUN_TO_BIKE_TRANSITION_V2", "RUNTOBIKETRANSITION",
                 "SWIM_TO_BIKE_TRANSITION_V2", "SWIMTOBIKETRANSITION",
                 "TRANSITION", "TRANSITION_V2" -> "Transition";
            case "MULTI_SPORT", "OTHER", "UNCATEGORIZED", "TEAM_SPORTS", "RACKET_SPORTS",
                 "WINTER_SPORTS", "AMERICAN_FOOTBALL", "BASEBALL", "BASKETBALL", "CRICKET",
                 "DISC_GOLF", "ULTIMATE_DISC", "LACROSSE", "SOFTBALL", "VOLLEYBALL",
                 "HORSEBACK_RIDING", "PARA_SPORTS", "DRIVING_GENERAL", "FLYING",
                 "MOTORCYCLING", "BOATING", "BOATING_V2", "FISHING", "FISHING_V2",
                 "SNOWMOBILING", "SNOWMOBILING_WS", "MEDITATION", "SEDENTARY",
                 "SLEEP", "STOP_WATCH" -> "Other";
            // Anything not yet in the Health API enum falls back to sport_type
            default -> null;
        };
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
            wellnessViewMapper.toIntervalsFields(row).forEach(target::put);
        }
        // Days carrying GARMIN-source load — Intervals cannot see that
        // work, so only those days (plus days lacking an Intervals ctl
        // entirely) get the locally computed values. Days whose load
        // Intervals already counted keep Intervals' own ctl/atl so the
        // app matches intervals.icu exactly.
        Set<LocalDate> garminLoadDays = dailyLoadRepository.findByUserIdAndSource(userId, "GARMIN")
                .stream().map(UserDailyLoad::getLoadDate).collect(Collectors.toSet());
        int fitnessDays = 0;
        for (UserFitness f : fitness) {
            Map<String, Object> target = byDate.get(f.getFitnessDate().toString());
            if (target == null) continue;
            if (target.get("ctl") != null && !garminLoadDays.contains(f.getFitnessDate())) continue;
            target.put("ctl", round1(f.getCtl()));
            target.put("atl", round1(f.getAtl()));
            target.put("rampRate", f.getRampRate() != null ? f.getRampRate() : 0);
            fitnessDays++;
        }
        if (!rows.isEmpty() || fitnessDays > 0) {
            log.debug("Wellness merge for user {}: {} Garmin wellness rows merged, {} days served with local CTL/ATL",
                    userLookupService.usernameOf(userId), rows.size(), fitnessDays);
        }
        return new ArrayList<>(byDate.values());
    }

    private double round1(double v) { return Math.round(v * 10.0) / 10.0; }

}
