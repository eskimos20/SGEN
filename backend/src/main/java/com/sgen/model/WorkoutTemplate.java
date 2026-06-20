package com.sgen.model;

import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class WorkoutTemplate {
    private String category;
    private String generatedName;  // Auto-generated descriptive name like "Anaerobic 2x21min @ 128-140%"
    private String originalFileName; // Original ZWO filename without extension (e.g., "VO2Max_TSS_85_v3")
    private String description;    // Anonymized description (original name removed)
    private int durationSeconds;
    private int durationMinutes;
    private int estimatedTSS;
    private ObjectNode workoutDoc;
    private String zwoFilePath;    // Path to original ZWO file for direct upload to intervals.icu
    private String structureSummary; // Cached summary like "5min warmup, 6x3min@105%, 5min cooldown"
    private String shortDescription; // Short description from metadata element in ZWO file
    private String sportType;      // Sport type from ZWO file (bike/run)
}
