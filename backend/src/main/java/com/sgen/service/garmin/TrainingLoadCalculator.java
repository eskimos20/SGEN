package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.sgen.entity.GarminActivity;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Training load (TSS-equivalent) for Garmin activities.
 * Power path: NP-based TSS = t * NP * IF / (FTP * 3600) * 100.
 * HR fallback: hrTSS approximation via avg HR vs LTHR (TRIMP-style).
 * FTP/LTHR: Intervals sport-settings when available, else local_sport_settings.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TrainingLoadCalculator {

    private final GarminSportSettingsService sportSettings;

    public Double compute(GarminActivity act, JsonNode streams) {
        if (streams == null) return null;
        ArrayNode watts = streams.has("watts") ? (ArrayNode) streams.get("watts") : null;
        if (watts != null && watts.size() > 60) {
            Double ftp = sportSettings.ftpWatts(act.getUserId(), act.getSportType());
            if (ftp != null && ftp > 0) {
                double np = normalizedPower(watts);
                if (np > 0) {
                    double durationS = act.getMovingTimeS() != null
                            ? act.getMovingTimeS()
                            : (act.getDurationS() != null ? act.getDurationS() : watts.size());
                    double ifactor = np / ftp;
                    return round1(durationS * np * ifactor / (ftp * 3600) * 100);
                }
            }
        }
        return hrTss(act);
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

    /** hrTSS ~ duration_s * (avgHr/lthr)^2 * 100 / 3600 (simplified TRIMP). */
    private Double hrTss(GarminActivity act) {
        if (act.getAvgHr() == null) return null;
        Integer lthr = sportSettings.lthr(act.getUserId(), act.getSportType());
        if (lthr == null || lthr <= 0) return null;
        double durationS = act.getMovingTimeS() != null
                ? act.getMovingTimeS()
                : (act.getDurationS() != null ? act.getDurationS() : 0);
        if (durationS <= 0) return null;
        double ratio = (double) act.getAvgHr() / lthr;
        return round1(durationS * ratio * ratio * 100 / 3600);
    }

    private Double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
