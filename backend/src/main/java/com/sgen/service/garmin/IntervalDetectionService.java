package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.sgen.entity.GarminActivityInterval;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Detects WORK/REST intervals from a samples stream when no device laps
 * exist — mirrors Intervals.icu icu_intervals semantics.
 * Metric: watts preferred, else velocity (pace sports).
 * Work threshold: FTP/pace-anchored when known, else relative to the
 * activity's own 60s-best. Segments <15s merged; work >=30s kept.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalDetectionService {

    private final GarminSportSettingsService sportSettings;

    private static final int MIN_WORK_S = 30;
    private static final int MERGE_GAP_S = 15;

    public List<GarminActivityInterval> detect(Long activityId, Long userId,
                                               String sportKey, JsonNode streams) {
        ArrayNode time = arr(streams, "time");
        ArrayNode watts = arr(streams, "watts");
        ArrayNode velocity = arr(streams, "velocity_smooth");
        ArrayNode hr = arr(streams, "heartrate");
        if (time == null || time.size() < 60) return List.of();

        boolean usePower = hasPositive(watts);
        ArrayNode metric = usePower ? watts : velocity;
        if (metric == null) return List.of();

        double threshold = workThreshold(metric, usePower, userId, sportKey);
        if (threshold <= 0) return List.of();

        int n = metric.size();
        boolean[] work = new boolean[n];
        for (int i = 0; i < n; i++) work[i] = metric.get(i).asDouble(0) > threshold;
        mergeShort(work, time, MERGE_GAP_S, false); // fill short rests
        mergeShort(work, time, MERGE_GAP_S, true);  // drop short works

        List<GarminActivityInterval> out = new ArrayList<>();
        int order = 0;
        int i = 0;
        while (i < n) {
            boolean isWork = work[i];
            int start = i;
            while (i < n && work[i] == isWork) i++;
            int end = i;
            if (isWork && durationSec(time, start, end) < MIN_WORK_S) continue;
            out.add(GarminActivityInterval.builder()
                    .activityId(activityId).stepOrder(order++)
                    .startIndex(start).endIndex(end)
                    .durationS((int) durationSec(time, start, end))
                    .type(isWork ? "WORK" : "REST")
                    .avgWatts(usePower ? avg(watts, start, end) : null)
                    .maxWatts(usePower ? max(watts, start, end) : null)
                    .avgHr(avg(hr, start, end))
                    .startHr(first(hr, start))
                    .endHr(last(hr, end))
                    .hrr(hrr(hr, start, end))
                    .avgSpeed(avg(velocity, start, end))
                    .build());
        }
        return out;
    }

    private double workThreshold(ArrayNode metric, boolean power, Long userId, String sportKey) {
        double best60 = CurveCalculator.bestAvg(metric, Math.min(60, metric.size()));
        if (power) {
            Double ftp = sportSettings.ftpWatts(userId, "ride");
            if (ftp != null && ftp > 0) return ftp * 0.85;
            return best60 * 0.80;
        }
        // pace: threshold at 90% of best 60s speed (interval speed vs easy)
        return best60 * 0.90;
    }

    private void mergeShort(boolean[] work, ArrayNode time, int maxSec, boolean workState) {
        int n = work.length, i = 0;
        while (i < n) {
            if (work[i] == workState) { i++; continue; }
            int s = i;
            while (i < n && work[i] != workState) i++;
            if (durationSec(time, s, i) <= maxSec && s > 0 && i < n) {
                for (int k = s; k < i; k++) work[k] = workState;
            }
        }
    }

    private double durationSec(ArrayNode time, int from, int to) {
        if (to >= time.size()) to = time.size() - 1;
        return time.get(to).asDouble(0) - time.get(from).asDouble(0);
    }

    private boolean hasPositive(ArrayNode a) {
        if (a == null) return false;
        for (JsonNode v : a) if (v.asDouble(0) > 0) return true;
        return false;
    }

    private ArrayNode arr(JsonNode s, String k) {
        return s.has(k) && s.get(k).isArray() ? (ArrayNode) s.get(k) : null;
    }

    private Double avg(ArrayNode a, int from, int to) {
        if (a == null) return null;
        double sum = 0; int n = 0;
        for (int i = from; i < Math.min(to, a.size()); i++) {
            double v = a.get(i).asDouble(0);
            if (v > 0) { sum += v; n++; }
        }
        return n > 0 ? sum / n : null;
    }
    private Double max(ArrayNode a, int from, int to) {
        if (a == null) return null;
        double m = 0;
        for (int i = from; i < Math.min(to, a.size()); i++) {
            double v = a.get(i).asDouble(0);
            if (v > m) m = v;
        }
        return m > 0 ? m : null;
    }
    private Integer first(ArrayNode a, int i) {
        return a != null && i < a.size() ? (int) a.get(i).asDouble(0) : null;
    }
    private Integer last(ArrayNode a, int i) {
        return a != null && i > 0 ? (int) a.get(Math.min(i - 1, a.size() - 1)).asDouble(0) : null;
    }
    private Double hrr(ArrayNode a, int from, int to) {
        Integer s = first(a, from), e = last(a, to);
        return (s != null && e != null && s > 0) ? (double) (s - e) : null;
    }
}
