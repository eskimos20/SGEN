package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.GarminConnection;
import com.sgen.entity.GarminWellness;
import com.sgen.repository.GarminConnectionRepository;
import com.sgen.repository.GarminWellnessRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;

/**
 * Stores Health API wellness summaries in garmin_wellness. Upserts by
 * summaryId (updates arrive re-sent with newer data — latest wins).
 * Normalized fields for the Intervals-compatible wellness view are read
 * out of payload_json at merge time by GarminWellnessViewMapper.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminWellnessMapper {

    private final com.sgen.repository.UserRepository userRepository;
    private final GarminWellnessRepository wellnessRepository;
    private final GarminConnectionRepository connectionRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void map(String type, JsonNode item) {
        String garminUserId = item.path("userId").asText(null);
        Optional<GarminConnection> conn = connectionRepository.findByGarminUserId(garminUserId);
        if (conn.isEmpty()) return;

        String summaryId = item.path("summaryId").asText(null);
        GarminWellness row = summaryId != null
                ? wellnessRepository.findBySummaryId(summaryId).orElse(null) : null;
        if (row == null) {
            row = GarminWellness.builder()
                    .userId(conn.get().getUserId())
                    .summaryType(type)
                    .build();
        }
        row.setSummaryId(summaryId);
        row.setSummaryDate(extractDate(item));
        row.setPayloadJson(item.toString());
        wellnessRepository.save(row);
    }

    private LocalDate extractDate(JsonNode item) {
        String calDate = item.path("calendarDate").asText(null);
        if (calDate != null && calDate.length() >= 10) {
            try { return LocalDate.parse(calDate.substring(0, 10)); } catch (Exception ignored) {}
        }
        long ts = item.path("startTimeInSeconds").asLong(
                item.path("measurementTimeInSeconds").asLong(0));
        if (ts > 0) {
            long offset = item.path("startTimeOffsetInSeconds")
                    .asLong(item.path("measurementTimeOffsetInSeconds").asLong(0));
            return LocalDate.ofInstant(Instant.ofEpochSecond(ts + offset), ZoneOffset.UTC);
        }
        return null;
    }

    private String nameOf(Long userId) {
        return userRepository.findById(userId).map(com.sgen.entity.User::getUsername).orElse(String.valueOf(userId));
    }
}
