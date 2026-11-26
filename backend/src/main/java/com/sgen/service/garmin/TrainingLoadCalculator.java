package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.sgen.entity.GarminActivity;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Training load (TSS-equivalent) for Garmin activities.
 * Power path: NP-based TSS = t * NP * IF / (FTP * 3600) * 100.
 * HR path: HRSS (normalised TRIMP, same model Intervals.icu uses by
 * default for HR-only activities) — TRIMP scaled so 1h at LTHR = 100.
 * FTP/LTHR: Intervals sport-settings when available, else local_sport_settings.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TrainingLoadCalculator {

    private final GarminSportSettingsService sportSettings;

    public Double compute(GarminActivity act, JsonNode streams) {
        return compute(act, streams, null);
    }

    /**
     * @param intervalsType resolved Intervals activity type (e.g. "NordicSki") —
     *                     its sport-settings thresholds win over sport_key.
     */
    public Double compute(GarminActivity act, JsonNode streams, String intervalsType) {
        ArrayNode watts = streams != null && streams.has("watts")
                ? (ArrayNode) streams.get("watts") : null;
        if (watts != null && watts.size() > 60) {
            Double ftp = sportSettings.ftpWatts(act.getUserId(), act.getSportType(), intervalsType);
            if (ftp != null && ftp > 0) {
                double np = normalizedPower(watts);
                if (np > 0) {
                    double durationS = durationS(act, watts.size());
                    double ifactor = np / ftp;
                    return round1(durationS * np * ifactor / (ftp * 3600) * 100);
                }
            }
        }
        return hrTss(act, intervalsType);
    }

    /** Classic 30s-rolling-average fourth-power NP. */
    private double normalizedPower(ArrayNode watts) {
        int n = watts.size();
        if (n < 30) return 0;
        double windowSum = 0;
        double fourthPowerSum = 0;
        int count = 0;
        for (int i = 0; i < n; i++) {
            double v = watts.get(i).asDouble(0);
            windowSum += v;
            if (i >= 30) windowSum -= watts.get(i - 30).asDouble(0);
            if (i >= 29) {
                double avg = windowSum / 30.0;
                fourthPowerSum += avg * avg * avg * avg;
                count++;
            }
        }
        return count > 0 ? Math.pow(fourthPowerSum / count, 0.25) : 0;
    }

    /**
     * HRSS / normalised TRIMP (Elevate model — Intervals.icu default for
     * HR-only activities):
     *   HRr   = (avgHR - restingHR) / (maxHR - restingHR)
     *   TRIMP = durationMin * HRr * k * e^(b * HRr)
     *   TSS   = 100 * TRIMP / TRIMP(1h @ LTHR)
     * k/b: 0.64/1.92 men, 0.86/1.67 women.
     * maxHR falls back to LTHR/0.95, restingHR to 60 when not configured.
     */
    private Double hrTss(GarminActivity act, String intervalsType) {
        if (act.getAvgHr() == null || act.getAvgHr() <= 0) return null;
        Integer lthr = sportSettings.lthr(act.getUserId(), act.getSportType(), intervalsType);
        if (lthr == null || lthr <= 0) return null;
        double durationS = durationS(act, 0);
        if (durationS <= 0) return null;

        int resting = Optional.ofNullable(sportSettings.restingHr(act.getUserId())).orElse(60);
        int max = Optional.ofNullable(sportSettings.maxHr(act.getUserId(), act.getSportType(), intervalsType))
                .orElse((int) Math.round(lthr / 0.95));
        if (max <= lthr || resting >= max) return null;

        boolean female = "F".equalsIgnoreCase(sportSettings.sex(act.getUserId()));
        double k = female ? 0.86 : 0.64;
        double b = female ? 1.67 : 1.92;

        double hrr = (act.getAvgHr() - resting) / (double) (max - resting);
        double lthrR = (lthr - resting) / (double) (max - resting);
        if (hrr <= 0 || lthrR <= 0) return null;

        double trimp = (durationS / 60.0) * hrr * k * Math.exp(b * hrr);
        double trimpAtLthr = 60.0 * lthrR * k * Math.exp(b * lthrR);
        return round1(100.0 * trimp / trimpAtLthr);
    }

    private double durationS(GarminActivity act, int fallback) {
        if (act.getMovingTimeS() != null && act.getMovingTimeS() > 0) return act.getMovingTimeS();
        if (act.getDurationS() != null && act.getDurationS() > 0) return act.getDurationS();
        return fallback;
    }

    private Double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
