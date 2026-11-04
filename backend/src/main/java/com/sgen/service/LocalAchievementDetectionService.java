package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.entity.UserAchievement;
import com.sgen.entity.UserPaceRecord;
import com.sgen.entity.UserPowerRecord;
import com.sgen.repository.UserAchievementRepository;
import com.sgen.repository.UserPaceRecordRepository;
import com.sgen.repository.UserPowerRecordRepository;
import com.sgen.repository.UserRepository;
import com.sgen.service.garmin.GarminClientFactory;
import com.sgen.service.garmin.IntervalsMirrorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Local achievement detection for activities that carry no
 * icu_achievements (i.e. activities not mirrored through Intervals —
 * e.g. direct Garmin push). Runs once per activity during stream
 * analysis and never re-evaluates.
 *
 * Rules mirror intervals.icu heuristics:
 *  - BEST_POWER: new all-time best average watts for a duration
 *  - BEST_PACE : new all-time best pace for a standard distance
 *  - FTP_UP    : max(0.80 * best 5min, 0.95 * best 20min) exceeds FTP
 *  - LTHR_UP   : max(0.98 * best 20min HR, 1.0 * best 60min HR) exceeds LTHR
 *
 * BEST_* achievements are stored with status RECORDED (informational);
 * FTP_UP/LTHR_UP are PENDING like the Intervals-sourced ones.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class LocalAchievementDetectionService {

    static final int[] WINDOW_DURATIONS = {
            1, 5, 15, 30, 60, 120, 180, 240, 300, 480, 600, 720, 900, 1200, 1800, 2400, 3600};
    static final int[] PACE_DISTANCES = {400, 1000, 1609, 5000, 10000, 21097, 42195};

    private final IntervalsActivityAnalysisService analysisService;
    private final IntervalsMirrorService mirrorService;
    private final IntervalsAthleteService athleteService;
    private final UserPowerRecordRepository powerRecordRepository;
    private final UserPaceRecordRepository paceRecordRepository;
    private final UserAchievementRepository achievementRepository;
    private final UserRepository userRepository;
    private final GarminClientFactory garminClientFactory;
    private final ObjectMapper objectMapper;

    /**
     * Local detection applies only when Garmin data is stored locally AND
     * the activity was not mirrored through Intervals (which already
     * provides icu_achievements — duplicates would result).
     */
    public boolean applies(Long userId, JsonNode activityPayload) {
        if (!garminClientFactory.isConnected(userId)) return false;
        JsonNode icu = activityPayload != null ? activityPayload.get("icu_achievements") : null;
        return icu == null || !icu.isArray() || icu.isEmpty();
    }

    /**
     * Compute best-average windows for watts/heartrate at all standard
     * durations and best pace per standard distance. Stored on the
     * analysis row so records and achievements never need stream rescans.
     */
    public ObjectNode computeWindows(JsonNode streams) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode watts = root.putObject("watts");
        ObjectNode hr = root.putObject("heartrate");
        for (int d : WINDOW_DURATIONS) {
            double w = analysisService.findBestWindow(streams, "watts", d);
            if (w > 0) watts.put(String.valueOf(d), w);
            double h = analysisService.findBestWindow(streams, "heartrate", d);
            if (h > 0) hr.put(String.valueOf(d), h);
        }
        ObjectNode pace = root.putObject("pace");
        for (int dist : PACE_DISTANCES) {
            double p = analysisService.findBestPace(streams, dist);
            if (p > 0) pace.put(String.valueOf(dist), p);
        }
        return root;
    }

    /**
     * Compare an activity's windows against the user's records and current
     * thresholds; create achievements and update records where beaten.
     */
    public void detect(Long userId, String activityId, JsonNode activityPayload,
                       JsonNode windows, String name, String type, LocalDate date,
                       boolean indoor) {
        try {
            if (!applies(userId, activityPayload) || windows == null) return;
            User user = userRepository.findById(userId).orElse(null);
            if (user == null) return;

            Map<Integer, Double> powerRecords = powerRecordMap(userId);
            Map<Integer, Double> paceRecords = paceRecordMap(userId);

            // BEST_POWER — per duration
            JsonNode watts = windows.path("watts");
            for (int d : WINDOW_DURATIONS) {
                double avg = watts.path(String.valueOf(d)).asDouble(0);
                if (avg <= 0) continue;
                Double record = powerRecords.get(d);
                if (record != null && record >= avg) continue;
                if (!existsBestPower(user, activityId, d)) {
                    saveAchievement(user, activityId, name, type, date, indoor,
                            "BEST_POWER", "BEST_POWER", b -> {
                                b.effortWatts((int) Math.round(avg));
                                b.effortSeconds(d);
                            });
                }
                upsertPowerRecord(userId, d, avg, activityId, date);
            }

            // BEST_PACE — per distance
            JsonNode pace = windows.path("pace");
            for (int dist : PACE_DISTANCES) {
                double mps = pace.path(String.valueOf(dist)).asDouble(0);
                if (mps <= 0) continue;
                Double record = paceRecords.get(dist);
                if (record != null && record >= mps) continue;
                if (!existsBestPace(user, activityId, dist)) {
                    saveAchievement(user, activityId, name, type, date, indoor,
                            "BEST_PACE", "BEST_PACE", b -> {
                                b.effortSeconds((int) Math.round(dist / mps));
                                b.effortDistance((double) dist);
                                b.effortPace(mps);
                            });
                }
                upsertPaceRecord(userId, dist, mps, activityId, date);
            }

            JsonNode sportSettings = mirrorService.getDoc(userId, "sportSettings");
            if (sportSettings == null) return; // thresholds unknown — skip FTP/LTHR

            // FTP_UP — max(0.80 * 5min, 0.95 * 20min) vs current FTP
            double best300 = watts.path("300").asDouble(0);
            double best1200 = watts.path("1200").asDouble(0);
            double ftpCandidate = Math.max(0.80 * best300, 0.95 * best1200);
            if (ftpCandidate > 0 && !achievementRepository.existsByUserAndActivityIdAndAchievementType(
                    user, activityId, "FTP_UP")) {
                Integer currentFtp = indoor
                        ? athleteService.getIndoorFtpForSport(sportSettings, type)
                        : athleteService.getFtpForSport(sportSettings, type);
                if (currentFtp == null || ftpCandidate > currentFtp) {
                    int effortSecs = (0.80 * best300) >= (0.95 * best1200) ? 300 : 1200;
                    int effortWatts = (int) Math.round(effortSecs == 300 ? best300 : best1200);
                    saveAchievement(user, activityId, name, type, date, indoor,
                            "FTP_UP", "ftp_up", b -> {
                                b.newFtpValue((int) Math.round(ftpCandidate));
                                b.oldFtpValue(currentFtp);
                                b.effortWatts(effortWatts);
                                b.effortSeconds(effortSecs);
                            });
                }
            }

            // LTHR_UP — max(0.98 * 20min HR, 1.0 * 60min HR) vs current LTHR
            JsonNode hr = windows.path("heartrate");
            double hr1200 = hr.path("1200").asDouble(0);
            double hr3600 = hr.path("3600").asDouble(0);
            double lthrCandidate = Math.max(0.98 * hr1200, hr3600);
            if (lthrCandidate > 0 && !achievementRepository.existsByUserAndActivityIdAndAchievementType(
                    user, activityId, "LTHR_UP")) {
                Integer currentLthr = athleteService.getLthrForSport(sportSettings, type);
                if (currentLthr == null || lthrCandidate > currentLthr) {
                    saveAchievement(user, activityId, name, type, date, indoor,
                            "LTHR_UP", "lthr_up", b -> {
                                b.newLthrValue((int) Math.round(lthrCandidate));
                                b.oldLthrValue(currentLthr);
                                b.effortSeconds(hr1200 * 0.98 >= hr3600 ? 1200 : 3600);
                            });
                }
            }
        } catch (Exception e) {
            log.debug("Local achievement detection failed for {}: {}", activityId, e.getMessage());
        }
    }

    private Map<Integer, Double> powerRecordMap(Long userId) {
        Map<Integer, Double> map = new HashMap<>();
        powerRecordRepository.findByUserId(userId)
                .forEach(r -> map.put(r.getDurationS(), r.getWatts()));
        return map;
    }

    private Map<Integer, Double> paceRecordMap(Long userId) {
        Map<Integer, Double> map = new HashMap<>();
        paceRecordRepository.findByUserId(userId)
                .forEach(r -> map.put(r.getDistanceM(), r.getPaceMps()));
        return map;
    }

    private void upsertPowerRecord(Long userId, int duration, double watts,
                                   String activityId, LocalDate date) {
        var row = powerRecordRepository.findByUserIdAndDurationS(userId, duration)
                .orElseGet(() -> UserPowerRecord.builder().userId(userId).durationS(duration).build());
        row.setWatts(watts);
        row.setActivityId(activityId);
        row.setActivityDate(date);
        powerRecordRepository.save(row);
    }

    private void upsertPaceRecord(Long userId, int distance, double pace,
                                  String activityId, LocalDate date) {
        var row = paceRecordRepository.findByUserIdAndDistanceM(userId, distance)
                .orElseGet(() -> UserPaceRecord.builder().userId(userId).distanceM(distance).build());
        row.setPaceMps(pace);
        row.setActivityId(activityId);
        row.setActivityDate(date);
        paceRecordRepository.save(row);
    }

    private boolean existsBestPower(User user, String activityId, int secs) {
        return achievementRepository
                .findByUserAndActivityIdAndAchievementType(user, activityId, "BEST_POWER")
                .filter(a -> a.getEffortSeconds() != null && a.getEffortSeconds() == secs)
                .isPresent();
    }

    private boolean existsBestPace(User user, String activityId, int distance) {
        return achievementRepository
                .findByUserAndActivityIdAndAchievementType(user, activityId, "BEST_PACE")
                .filter(a -> a.getEffortDistance() != null
                        && Math.abs(a.getEffortDistance() - distance) < 0.5)
                .isPresent();
    }

    private void saveAchievement(User user, String activityId, String name, String sportType,
                                 LocalDate date, boolean indoor, String type, String achievementId,
                                 java.util.function.Consumer<UserAchievement.UserAchievementBuilder> fill) {
        var b = UserAchievement.builder()
                .user(user)
                .achievementId(achievementId)
                .activityId(activityId)
                .activityName(name != null ? name : activityId)
                .sportType(sportType != null ? sportType : "Ride")
                .achievementDate(date != null ? date : LocalDate.now())
                .achievementType(type)
                .indoor(indoor);
        fill.accept(b);
        b.status(type.startsWith("BEST_")
                ? UserAchievement.AchievementStatus.RECORDED
                : UserAchievement.AchievementStatus.PENDING);
        achievementRepository.save(b.build());
    }
}
