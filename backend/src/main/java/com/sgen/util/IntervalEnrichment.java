package com.sgen.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;

/**
 * Enriches Intervals.icu interval objects with values derived from the
 * activity's sample streams — per-interval start/end HR and heart-rate
 * recovery (hrr) for REST/RECOVERY intervals that follow WORK intervals.
 * Shared by the activity feed, activity details and interval computation.
 */
public final class IntervalEnrichment {

    private IntervalEnrichment() {}

    public static void enrich(JsonNode intervals, JsonNode streams) {
        if (intervals == null || !intervals.isArray() || streams == null) return;

        List<Integer> hrData = extractStreamValues(streams, "heartrate");
        List<Double> timeData = extractStreamValuesAsDouble(streams, "time");

        if (hrData == null || hrData.isEmpty() || timeData == null || timeData.isEmpty()
                || hrData.size() != timeData.size()) {
            return;
        }

        ArrayNode intervalArray = (ArrayNode) intervals;

        // Start/end HR for every interval that has valid stream indices
        for (int i = 0; i < intervalArray.size(); i++) {
            JsonNode interval = intervalArray.get(i);
            if (!interval.isObject()) continue;
            int startIndex = interval.path("start_index").asInt(-1);
            if (startIndex >= 0 && startIndex < hrData.size()) {
                int startHr = hrData.get(startIndex);
                if (startHr > 0) {
                    ((ObjectNode) interval).put("start_hr", startHr);
                }
            }
            int endIndex = interval.path("end_index").asInt(-1);
            if (endIndex >= 0 && endIndex < hrData.size()) {
                int endHr = hrData.get(endIndex);
                if (endHr > 0) {
                    ((ObjectNode) interval).put("end_hr", endHr);
                }
            }
        }

        // HRR for REST/RECOVERY intervals that follow a WORK interval
        for (int i = 1; i < intervalArray.size(); i++) {
            JsonNode rest = intervalArray.get(i);
            JsonNode work = intervalArray.get(i - 1);
            if (!rest.isObject() || !work.isObject()) continue;

            String restType = rest.path("type").asText("").toUpperCase();
            String workType = work.path("type").asText("").toUpperCase();
            if (!("RECOVERY".equals(restType) || "REST".equals(restType))) continue;
            if (!"WORK".equals(workType)) continue;

            int workEndIndex = work.path("end_index").asInt(-1);
            int restStartIndex = rest.path("start_index").asInt(-1);
            if (workEndIndex < 0 || workEndIndex >= timeData.size()) continue;
            if (restStartIndex < 0 || restStartIndex >= timeData.size()) continue;

            double restStartTime = timeData.get(restStartIndex);

            // Average HR in the last ~10 seconds before the rest starts
            double endWinStart = Math.max(0, restStartTime - 10);
            double endWinEnd = restStartTime;
            double hrAtEndSum = 0;
            int hrAtEndCount = 0;
            for (int j = 0; j < timeData.size(); j++) {
                double t = timeData.get(j);
                if (t >= endWinStart && t <= endWinEnd && hrData.get(j) > 0) {
                    hrAtEndSum += hrData.get(j);
                    hrAtEndCount++;
                }
            }
            if (hrAtEndCount == 0) continue;
            double hrAtEnd = hrAtEndSum / hrAtEndCount;

            // Average HR around 60 seconds into the rest interval
            double recoveryCenter = restStartTime + 60;
            double window = 5.0;
            double recWinStart = recoveryCenter - window / 2.0;
            double recWinEnd = recoveryCenter + window / 2.0;
            double hrAfterSum = 0;
            int hrAfterCount = 0;
            for (int j = 0; j < timeData.size(); j++) {
                double t = timeData.get(j);
                if (t >= recWinStart && t <= recWinEnd && hrData.get(j) > 0) {
                    hrAfterSum += hrData.get(j);
                    hrAfterCount++;
                }
            }
            if (hrAfterCount == 0) continue;
            double hrAfterRecovery = hrAfterSum / hrAfterCount;

            double hrr = hrAtEnd - hrAfterRecovery;
            ((ObjectNode) rest).put("hrr", Math.round(hrr));
        }
    }

    /**
     * Extract an integer-valued stream from either array or object format.
     */
    private static List<Integer> extractStreamValues(JsonNode streams, String key) {
        List<Integer> values = null;
        if (streams.isArray()) {
            for (JsonNode stream : streams) {
                if (key.equals(stream.path("type").asText())) {
                    JsonNode data = stream.path("data");
                    if (data.isArray()) {
                        values = new ArrayList<>(data.size());
                        for (JsonNode d : data) values.add(d.asInt(0));
                    }
                    break;
                }
            }
        } else if (streams.isObject()) {
            JsonNode node = streams.get(key);
            if (node != null && node.isArray()) {
                values = new ArrayList<>(node.size());
                for (JsonNode d : node) values.add(d.asInt(0));
            } else if (node != null && node.has("data")) {
                JsonNode data = node.get("data");
                if (data.isArray()) {
                    values = new ArrayList<>(data.size());
                    for (JsonNode d : data) values.add(d.asInt(0));
                }
            }
        }
        return values;
    }

    /**
     * Extract a double-valued stream from either array or object format.
     */
    private static List<Double> extractStreamValuesAsDouble(JsonNode streams, String key) {
        List<Double> values = null;
        if (streams.isArray()) {
            for (JsonNode stream : streams) {
                if (key.equals(stream.path("type").asText())) {
                    JsonNode data = stream.path("data");
                    if (data.isArray()) {
                        values = new ArrayList<>(data.size());
                        for (JsonNode d : data) values.add(d.asDouble(0));
                    }
                    break;
                }
            }
        } else if (streams.isObject()) {
            JsonNode node = streams.get(key);
            if (node != null && node.isArray()) {
                values = new ArrayList<>(node.size());
                for (JsonNode d : node) values.add(d.asDouble(0));
            } else if (node != null && node.has("data")) {
                JsonNode data = node.get("data");
                if (data.isArray()) {
                    values = new ArrayList<>(data.size());
                    for (JsonNode d : data) values.add(d.asDouble(0));
                }
            }
        }
        return values;
    }
}
