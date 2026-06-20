package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.model.WorkoutTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class ZwoParser {

    private final ObjectMapper objectMapper;

    public WorkoutTemplate parse(Path file, String category) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document doc = builder.parse(file.toFile());
        Element root = doc.getDocumentElement();

        String originalFileName = file.getFileName().toString().replace(".zwo", "");
        String workoutName = originalFileName.replace("_", " ");

        String description = getElementText(root, "description");
        if (description == null || description.isEmpty()) {
            description = "A " + category + " workout.";
        }

        String shortDescription = null;
        NodeList metadataNodes = root.getElementsByTagName("metadata");
        if (metadataNodes.getLength() > 0) {
            shortDescription = getElementText((Element) metadataNodes.item(0), "shortDescription");
        }

        String sportType = getElementText(root, "sportType");
        log.debug("Extracted sportType: '{}' from file: {}", sportType, file.getFileName());
        if (sportType == null || sportType.isEmpty()) {
            sportType = "bike";
            log.debug("Using default sportType: 'bike' for file: {}", file.getFileName());
        }

        NodeList workoutNodes = root.getElementsByTagName("workout");
        if (workoutNodes.getLength() == 0) return null;

        ArrayNode steps = parseWorkoutSteps((Element) workoutNodes.item(0));
        if (steps.isEmpty()) return null;

        int totalDurationSeconds = calculateTotalDuration(steps);
        int estimatedTSS = calculateTSS(steps, totalDurationSeconds);

        ObjectNode workoutDoc = objectMapper.createObjectNode();
        workoutDoc.set("steps", steps);
        String structureSummary = getWorkoutStructureSummary(workoutDoc);

        return WorkoutTemplate.builder()
                .category(category)
                .generatedName(workoutName)
                .originalFileName(originalFileName)
                .description(description)
                .shortDescription(shortDescription)
                .durationSeconds(totalDurationSeconds)
                .durationMinutes(totalDurationSeconds / 60)
                .estimatedTSS(estimatedTSS)
                .workoutDoc(workoutDoc)
                .zwoFilePath(file.toAbsolutePath().toString())
                .structureSummary(structureSummary)
                .sportType(sportType)
                .build();
    }

    private ArrayNode parseWorkoutSteps(Element workoutElement) {
        ArrayNode steps = objectMapper.createArrayNode();
        NodeList children = workoutElement.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (children.item(i) instanceof Element) {
                ObjectNode stepNode = parseStep((Element) children.item(i));
                if (stepNode != null) steps.add(stepNode);
            }
        }
        return steps;
    }

    private ObjectNode parseStep(Element step) {
        String tagName = step.getTagName();
        ObjectNode stepNode = objectMapper.createObjectNode();

        String durationAttr = step.getAttribute("Duration");
        if (durationAttr == null || durationAttr.isEmpty()) return null;

        int duration = (int) Double.parseDouble(durationAttr);
        stepNode.put("duration", duration);

        ObjectNode power = stepNode.putObject("power");
        power.put("units", "%ftp");

        switch (tagName) {
            case "Warmup":
            case "Ramp": {
                String low = step.getAttribute("PowerLow");
                String high = step.getAttribute("PowerHigh");
                if (low.isEmpty() || high.isEmpty()) return null;
                power.put("start", (int) Math.round(Double.parseDouble(low) * 100));
                power.put("end", (int) Math.round(Double.parseDouble(high) * 100));
                break;
            }
            case "Cooldown": {
                String low = step.getAttribute("PowerLow");
                String high = step.getAttribute("PowerHigh");
                if (low.isEmpty() || high.isEmpty()) return null;
                double lo = Double.parseDouble(low), hi = Double.parseDouble(high);
                power.put("start", (int) Math.round(Math.max(lo, hi) * 100));
                power.put("end", (int) Math.round(Math.min(lo, hi) * 100));
                break;
            }
            case "SteadyState": {
                String pw = step.getAttribute("Power");
                if (pw.isEmpty()) return null;
                power.put("value", (int) Math.round(Double.parseDouble(pw) * 100));
                break;
            }
            case "IntervalsT": {
                String repeat = step.getAttribute("Repeat");
                String onDur = step.getAttribute("OnDuration");
                String offDur = step.getAttribute("OffDuration");
                String onPw = step.getAttribute("OnPower");
                String offPw = step.getAttribute("OffPower");
                if (repeat.isEmpty() || onDur.isEmpty() || offDur.isEmpty() || onPw.isEmpty() || offPw.isEmpty()) return null;

                stepNode.remove("duration");
                stepNode.remove("power");
                stepNode.put("reps", Integer.parseInt(repeat));
                ArrayNode intervalSteps = stepNode.putArray("steps");

                ObjectNode onStep = objectMapper.createObjectNode();
                onStep.put("duration", (int) Double.parseDouble(onDur));
                ObjectNode onPowerNode = onStep.putObject("power");
                onPowerNode.put("units", "%ftp");
                onPowerNode.put("value", (int) Math.round(Double.parseDouble(onPw) * 100));
                intervalSteps.add(onStep);

                ObjectNode offStep = objectMapper.createObjectNode();
                offStep.put("duration", (int) Double.parseDouble(offDur));
                ObjectNode offPowerNode = offStep.putObject("power");
                offPowerNode.put("units", "%ftp");
                offPowerNode.put("value", (int) Math.round(Double.parseDouble(offPw) * 100));
                intervalSteps.add(offStep);
                break;
            }
            case "FreeRide":
                power.put("value", 50);
                break;
            default:
                return null;
        }
        return stepNode;
    }

    private int calculateTotalDuration(ArrayNode steps) {
        int total = 0;
        for (JsonNode step : steps) {
            if (step.has("duration")) {
                total += step.get("duration").asInt();
            } else if (step.has("reps") && step.has("steps")) {
                int reps = step.get("reps").asInt();
                int stepDuration = 0;
                for (JsonNode sub : step.get("steps")) stepDuration += sub.get("duration").asInt();
                total += reps * stepDuration;
            }
        }
        return total;
    }

    private int calculateTSS(ArrayNode steps, int totalDurationSeconds) {
        double totalWeightedPower = 0;
        int totalDuration = 0;
        for (JsonNode step : steps) {
            int[] dp = getStepDurationAndAvgPower(step);
            totalWeightedPower += dp[0] * Math.pow(dp[1] / 100.0, 4);
            totalDuration += dp[0];
        }
        if (totalDuration == 0) return 0;
        double np = Math.pow(totalWeightedPower / totalDuration, 0.25) * 100;
        double IF = np / 100.0;
        return (int) Math.round((totalDurationSeconds / 3600.0) * IF * IF * 100);
    }

    private int[] getStepDurationAndAvgPower(JsonNode step) {
        if (step.has("reps") && step.has("steps")) {
            int reps = step.get("reps").asInt();
            int totalDuration = 0;
            double totalPower = 0;
            for (JsonNode sub : step.get("steps")) {
                int d = sub.get("duration").asInt();
                int p = getStepPower(sub);
                totalDuration += d;
                totalPower += d * p;
            }
            int avg = totalDuration > 0 ? (int) (totalPower / totalDuration) : 50;
            return new int[]{totalDuration * reps, avg};
        }
        return new int[]{step.get("duration").asInt(), getStepPower(step)};
    }

    int getStepPower(JsonNode step) {
        JsonNode power = step.get("power");
        if (power == null) return 50;
        if (power.has("value")) return power.get("value").asInt();
        if (power.has("start") && power.has("end"))
            return (power.get("start").asInt() + power.get("end").asInt()) / 2;
        return 50;
    }

    private String getWorkoutStructureSummary(ObjectNode workoutDoc) {
        if (workoutDoc == null || !workoutDoc.has("steps")) return "Unknown";
        JsonNode steps = workoutDoc.get("steps");
        List<int[]> workIntervals = new ArrayList<>();
        int totalWorkSec = 0;

        for (JsonNode step : steps) {
            int duration = step.has("duration") ? step.get("duration").asInt() : 0;
            if (step.has("reps")) {
                int reps = step.get("reps").asInt();
                JsonNode subSteps = step.get("steps");
                if (subSteps != null) {
                    for (int i = 0; i < reps; i++) {
                        for (JsonNode sub : subSteps) {
                            int dur = sub.has("duration") ? sub.get("duration").asInt() : 0;
                            int pwr = getStepPower(sub);
                            if (pwr >= 60) { workIntervals.add(new int[]{dur, pwr}); totalWorkSec += dur; }
                        }
                    }
                }
            } else {
                JsonNode power = step.get("power");
                if (power != null && power.has("value")) {
                    int pwr = power.get("value").asInt();
                    if (pwr >= 60) { workIntervals.add(new int[]{duration, pwr}); totalWorkSec += duration; }
                }
            }
        }

        StringBuilder summary = new StringBuilder();
        if (!workIntervals.isEmpty()) {
            summary.append(String.join(" ", groupIntervals(workIntervals)));
        } else if (totalWorkSec == 0) {
            int totalSec = 0;
            for (JsonNode step : steps) totalSec += step.has("duration") ? step.get("duration").asInt() : 0;
            summary.append(formatDuration(totalSec)).append("@70%");
        }
        String result = summary.toString().trim();
        return result.isEmpty() ? "Steady" : result;
    }

    private List<String> groupIntervals(List<int[]> intervals) {
        List<String> descriptions = new ArrayList<>();
        if (intervals.size() >= 2) {
            boolean isRepeating = true;
            for (int i = 2; i < intervals.size(); i++) {
                int[] cur = intervals.get(i), pat = intervals.get(i % 2);
                if (Math.abs(cur[0] - pat[0]) > 10 || Math.abs(cur[1] - pat[1]) > 5) { isRepeating = false; break; }
            }
            if (isRepeating && intervals.size() % 2 == 0) {
                int[] work = intervals.get(0);
                descriptions.add((intervals.size() / 2) + "x" + formatDuration(work[0]) + "@" + roundPower(work[1]) + "%");
                return descriptions;
            }
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (int[] iv : intervals) {
            if (iv[1] < 60) continue;
            String key = formatDuration(iv[0]) + "@" + roundPower(iv[1]) + "%";
            counts.merge(key, 1, Integer::sum);
        }
        for (Map.Entry<String, Integer> e : counts.entrySet())
            descriptions.add(e.getValue() > 1 ? e.getValue() + "x" + e.getKey() : e.getKey());
        return descriptions.isEmpty() ? List.of("Mixed intervals") : descriptions;
    }

    private String formatDuration(int seconds) {
        return seconds < 60 ? seconds + "s" : ((seconds + 30) / 60) + "min";
    }

    private int roundPower(int power) {
        int rounded = ((power + 2) / 5) * 5;
        return rounded == 0 ? power : rounded;
    }

    private String getElementText(Element parent, String tagName) {
        NodeList nodes = parent.getElementsByTagName(tagName);
        return nodes.getLength() > 0 ? nodes.item(0).getTextContent() : null;
    }
}
