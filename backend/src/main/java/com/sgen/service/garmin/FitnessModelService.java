package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.entity.*;
import com.sgen.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * Own fitness model: aggregates daily training load per source
 * (GARMIN / INTERVALS) into user_daily_load, then recomputes the
 * CTL/ATL/TSB exponential series into user_fitness.
 * CTL: EMA tau 42d, ATL: tau 7d, TSB = CTL-ATL, rampRate = CTL delta /7d.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FitnessModelService {

    private static final int LOOKBACK_DAYS = 400;
    private final UserDailyLoadRepository dailyLoadRepository;
    private final UserFitnessRepository fitnessRepository;
    private final GarminActivityRepository garminActivityRepository;
    private final UserRepository userRepository;

    /** Rebuild GARMIN-sourced daily loads from stored garmin_activities. */
    @Transactional
    public void rebuildGarminLoads(Long userId) {
        List<GarminActivity> acts = garminActivityRepository
                .findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(
                        userId, java.time.LocalDateTime.of(2000, 1, 1, 0, 0), java.time.LocalDateTime.now().plusDays(1));
        Map<LocalDate, double[]> byDay = new HashMap<>();
        for (GarminActivity a : acts) {
            LocalDate d = a.getStartDateLocal() != null ? a.getStartDateLocal().toLocalDate() : null;
            if (d == null || a.getTrainingLoad() == null) continue;
            double[] acc = byDay.computeIfAbsent(d, k -> new double[2]);
            acc[0] += a.getTrainingLoad();
            acc[1]++;
        }
        byDay.forEach((d, acc) -> {
            UserDailyLoad row = dailyLoadRepository
                    .findByUserIdAndLoadDateAndSource(userId, d, "GARMIN")
                    .orElseGet(() -> UserDailyLoad.builder().userId(userId).loadDate(d).source("GARMIN").build());
            row.setTrainingLoad(acc[0]);
            row.setActivityCount((int) acc[1]);
            dailyLoadRepository.save(row);
        });
        recompute(userId);
    }

    /** Record INTERVALS-sourced loads seen during a fetchAllData call (cache + merge input). */
    @Transactional
    public void recordIntervalsLoads(Long userId, JsonNode activities) {
        if (activities == null || !activities.isArray()) return;
        Map<LocalDate, double[]> byDay = new HashMap<>();
        for (JsonNode a : activities) {
            double load = a.path("icu_training_load").asDouble(0);
            String ds = a.path("start_date_local").asText("");
            if (load <= 0 || ds.length() < 10) continue;
            LocalDate d;
            try { d = LocalDate.parse(ds.substring(0, 10)); } catch (Exception e) { continue; }
            double[] acc = byDay.computeIfAbsent(d, k -> new double[2]);
            acc[0] += load;
            acc[1]++;
        }
        byDay.forEach((d, acc) -> {
            UserDailyLoad row = dailyLoadRepository
                    .findByUserIdAndLoadDateAndSource(userId, d, "INTERVALS")
                    .orElseGet(() -> UserDailyLoad.builder().userId(userId).loadDate(d).source("INTERVALS").build());
            row.setTrainingLoad(acc[0]);
            row.setActivityCount((int) acc[1]);
            dailyLoadRepository.save(row);
        });
        recompute(userId);
    }

    /** Recompute the EMA series from combined daily loads (last 400 days). */
    @Transactional
    public void recompute(Long userId) {
        LocalDate from = LocalDate.now().minusDays(LOOKBACK_DAYS);
        List<UserDailyLoad> rows = dailyLoadRepository.findByUserIdAndLoadDateGreaterThanEqual(userId, from);
        if (rows.isEmpty()) return;
        Map<LocalDate, Double> total = new TreeMap<>();
        for (UserDailyLoad r : rows) {
            total.merge(r.getLoadDate(), r.getTrainingLoad(), Double::sum);
        }
        // EMA must start from zero-load days too: walk each calendar day
        LocalDate first = total.keySet().iterator().next();
        // seed from previous fitness row if exists (continuity across lookback)
        double ctl = 0, atl = 0;
        for (LocalDate d = first; !d.isAfter(LocalDate.now()); d = d.plusDays(1)) {
            double load = total.getOrDefault(d, 0.0);
            ctl += (load - ctl) / 42.0;
            atl += (load - atl) / 7.0;
            double tsb = ctl - atl;
            Double ramp = null;
            UserFitness prev7 = fitnessRepository.findByUserIdAndFitnessDate(userId, d.minusDays(7)).orElse(null);
            if (prev7 != null) ramp = (ctl - prev7.getCtl()) / 7.0;
            final double fCtl = ctl;
            final LocalDate fd = d;
            UserFitness row = fitnessRepository.findByUserIdAndFitnessDate(userId, fd)
                    .orElseGet(() -> UserFitness.builder().userId(userId).fitnessDate(fd).build());
            row.setDailyLoad(load);
            row.setCtl(fCtl);
            row.setAtl(atl);
            row.setTsb(tsb);
            row.setRampRate(ramp);
            fitnessRepository.save(row);
        }
    }
}
