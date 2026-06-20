package com.sgen.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.regex.Pattern;

@Component
@Slf4j
public class ActivityStreamDumper {

    private final ObjectMapper objectMapper;
    private static final Pattern NON_ASCII = Pattern.compile("[^a-zA-Z0-9-]");
    private static final Path ACTIVITY_DATA_DIR = Paths.get("activity-data");

    public ActivityStreamDumper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Dump activity streams (time, watts, heartrate) to a JSON file
     * 
     * @param activityName Name of the activity
     * @param activityDate Date of the activity
     * @param streams Raw streams data from Intervals.icu
     */
    public void dumpStreams(String activityName, LocalDate activityDate, JsonNode streams) {
        if (streams == null || !streams.isArray() || streams.size() == 0) {
            log.debug("No streams data to dump for activity: {}", activityName);
            return;
        }

        try {
            // Ensure directory exists
            if (!Files.exists(ACTIVITY_DATA_DIR)) {
                Files.createDirectories(ACTIVITY_DATA_DIR);
            }

            // Sanitize filename
            String sanitizedName = sanitizeFilename(activityName);
            String filename = String.format("%s-%s.json", sanitizedName, activityDate.toString());
            Path filePath = ACTIVITY_DATA_DIR.resolve(filename);

            // Extract relevant streams
            ObjectNode output = objectMapper.createObjectNode();
            output.put("activityName", activityName);
            output.put("activityDate", activityDate.toString());

            ArrayNode dataPoints = objectMapper.createArrayNode();

            // Find the streams we need
            JsonNode timeStream = null;
            JsonNode wattsStream = null;
            JsonNode heartrateStream = null;

            for (JsonNode stream : streams) {
                String type = stream.path("type").asText();
                switch (type) {
                    case "time" -> timeStream = stream.path("data");
                    case "watts" -> wattsStream = stream.path("data");
                    case "heartrate" -> heartrateStream = stream.path("data");
                }
            }

            if (timeStream == null || !timeStream.isArray()) {
                log.warn("No time stream found for activity: {}", activityName);
                return;
            }

            int size = timeStream.size();
            for (int i = 0; i < size; i++) {
                ObjectNode point = objectMapper.createObjectNode();
                point.put("time", timeStream.get(i).asInt(0));
                
                if (wattsStream != null && wattsStream.isArray() && i < wattsStream.size()) {
                    point.put("watts", wattsStream.get(i).asInt(0));
                }
                
                if (heartrateStream != null && heartrateStream.isArray() && i < heartrateStream.size()) {
                    point.put("heartrate", heartrateStream.get(i).asInt(0));
                }
                
                dataPoints.add(point);
            }

            output.set("dataPoints", dataPoints);

            // Write to file with pretty printing
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(output);
            Files.writeString(filePath, json);

            log.info("Dumped activity streams to: {}", filePath);

        } catch (IOException e) {
            log.error("Failed to dump activity streams for {}: {}", activityName, e.getMessage());
        }
    }

    /**
     * Sanitize filename by removing Swedish characters and special characters
     */
    private String sanitizeFilename(String name) {
        if (name == null || name.isEmpty()) {
            return "unknown";
        }

        // Normalize to decompose accented characters
        String normalized = Normalizer.normalize(name, Normalizer.Form.NFD);
        
        // Remove diacritical marks
        normalized = normalized.replaceAll("\\p{M}", "");
        
        // Replace spaces with hyphens
        normalized = normalized.replace(" ", "-");
        
        // Remove any remaining non-ASCII characters
        normalized = NON_ASCII.matcher(normalized).replaceAll("");
        
        // Remove multiple consecutive hyphens
        normalized = normalized.replaceAll("-+", "-");
        
        // Remove leading/trailing hyphens
        normalized = normalized.replaceAll("^-|-$", "");
        
        // Limit length
        if (normalized.length() > 100) {
            normalized = normalized.substring(0, 100);
        }
        
        return normalized.isEmpty() ? "unknown" : normalized;
    }
}
