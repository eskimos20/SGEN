package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.IntervalsActivity;
import com.sgen.entity.IntervalsActivityStreams;
import com.sgen.entity.IntervalsEvent;
import com.sgen.repository.IntervalsActivityRepository;
import com.sgen.repository.IntervalsActivityStreamsRepository;
import com.sgen.repository.IntervalsEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Writes verbatim Intervals.icu payloads into the local mirror tables
 * (intervals_activities / intervals_activity_streams / intervals_events).
 * Shared by the historical backfill and the on-demand fetch fallback for
 * Garmin-connected users whose mirror is still empty.
 * Upserts by (user_id, activity_id/event_id) — safe to re-run.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsMirrorService {

    private final IntervalsActivityRepository activityRepository;
    private final IntervalsActivityStreamsRepository streamsRepository;
    private final IntervalsEventRepository eventRepository;
    private final ObjectMapper objectMapper;

    public boolean hasActivities(Long userId) {
        return activityRepository.countByUserId(userId) > 0;
    }

    public boolean hasEvents(Long userId) {
        return eventRepository.countByUserId(userId) > 0;
    }

    /** Persist the verbatim Intervals activity JSON so lists/details can replay it locally. */
    public void saveActivity(Long userId, JsonNode a) {
        try {
            String id = a.path("id").asText("");
            if (id.isBlank()) return;
            var row = activityRepository.findByUserIdAndActivityId(userId, id)
                    .orElseGet(() -> IntervalsActivity.builder().userId(userId).activityId(id).build());
            String ds = a.path("start_date_local").asText("");
            if (ds.length() >= 19) row.setStartDateLocal(java.time.LocalDateTime.parse(ds.substring(0, 19)));
            if (a.hasNonNull("moving_time")) row.setMovingTimeS(a.get("moving_time").asInt());
            row.setTrainingLoad(a.path("icu_training_load").asDouble(0));
            row.setPayloadJson(objectMapper.writeValueAsString(a));
            activityRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist activity failed: {}", e.getMessage());
        }
    }

    /** Persist already-fetched streams/intervals JSON for one activity. */
    public void saveStreams(Long userId, String activityId, JsonNode streams, JsonNode intervals) {
        if (activityId == null || activityId.isBlank() || (streams == null && intervals == null)) return;
        try {
            var row = streamsRepository.findByUserIdAndActivityId(userId, activityId)
                    .orElseGet(() -> IntervalsActivityStreams.builder().userId(userId).activityId(activityId).build());
            if (streams != null) row.setStreamsJson(objectMapper.writeValueAsString(streams));
            if (intervals != null) row.setIntervalsJson(objectMapper.writeValueAsString(intervals));
            streamsRepository.save(row);
        } catch (Exception e) {
            log.debug("Mirror persist streams for {} failed: {}", activityId, e.getMessage());
        }
    }

    /** Persist every event in an Intervals events array. */
    public void saveEvents(Long userId, JsonNode events) {
        if (events == null || !events.isArray()) return;
        for (JsonNode ev : events) {
            try {
                String id = ev.path("id").asText("");
                if (id.isBlank()) continue;
                var row = eventRepository.findByUserIdAndEventId(userId, id)
                        .orElseGet(() -> IntervalsEvent.builder().userId(userId).eventId(id).build());
                String ds = ev.path("start_date_local").asText("");
                if (ds.length() >= 19) row.setStartDateLocal(java.time.LocalDateTime.parse(ds.substring(0, 19)));
                row.setCategory(ev.path("category").asText(null));
                row.setPayloadJson(objectMapper.writeValueAsString(ev));
                eventRepository.save(row);
            } catch (Exception e) {
                log.debug("Mirror persist event failed: {}", e.getMessage());
            }
        }
    }
}
