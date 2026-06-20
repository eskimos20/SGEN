package com.sgen.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.CalendarEvent;
import com.sgen.repository.CalendarEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class CalendarEventService {

    private final CalendarEventRepository calendarEventRepository;
    private final ObjectMapper objectMapper;
    private final IntervalsEventService eventService;
    private final WorkoutLibraryService workoutLibraryService;
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /**
     * Save calendar events with deload status from batch creation
     */
    @Transactional
    public void saveCalendarEvents(String username, List<Map<String, Object>> events) {
        for (Map<String, Object> eventData : events) {
            try {
                Integer intervalsEventId = null;
                Object idObj = eventData.get("id");
                if (idObj != null) {
                    if (idObj instanceof Integer) {
                        intervalsEventId = (Integer) idObj;
                    } else if (idObj instanceof JsonNode) {
                        intervalsEventId = ((JsonNode) idObj).asInt();
                    } else {
                        intervalsEventId = Integer.parseInt(idObj.toString());
                    }
                }
                
                if (intervalsEventId == null) {
                    // This is a pending event (not yet created in Intervals.icu)
                    // We'll save it later when it gets an ID
                    continue;
                }

                String startDateStr = (String) eventData.get("start_date_local");
                if (startDateStr == null) {
                    log.warn("Event missing start_date_local, skipping: {}", eventData);
                    continue;
                }

                LocalDate eventDate = LocalDate.parse(startDateStr.substring(0, 10), DATE_FORMATTER);
                String eventName = (String) eventData.get("name");
                Boolean isDeloadWeek = (Boolean) eventData.get("isDeloadWeek");
                String originalFileName = (String) eventData.get("originalFileName");

                // Check if event already exists
                Optional<CalendarEvent> existingEvent = calendarEventRepository
                    .findByIntervalsEventIdAndUsername(intervalsEventId, username);

                if (existingEvent.isPresent()) {
                    // Update existing event
                    CalendarEvent event = existingEvent.get();
                    event.setEventName(eventName);
                    event.setIsDeloadWeek(isDeloadWeek != null ? isDeloadWeek : false);
                    if (originalFileName != null) {
                        event.setOriginalFileName(originalFileName);
                    }
                    calendarEventRepository.save(event);
                } else {
                    // Create new event
                    CalendarEvent newEvent = new CalendarEvent(
                        intervalsEventId, 
                        username, 
                        eventDate, 
                        eventName, 
                        isDeloadWeek != null ? isDeloadWeek : false
                    );
                    if (originalFileName != null) {
                        newEvent.setOriginalFileName(originalFileName);
                    }
                    calendarEventRepository.save(newEvent);
                }
            } catch (Exception e) {
                log.error("Failed to save calendar event for user {}: {}", username, e.getMessage(), e);
            }
        }
    }

    /**
     * Get calendar events with deload status for a date range
     */
    public List<Map<String, Object>> getCalendarEventsWithDeloadStatus(String username, String oldest, String newest) {
        try {
            // Get events from Intervals.icu
            JsonNode intervalsEvents = eventService.fetchCalendarEvents(username, oldest, newest);

            // Merge deload status from our database
            List<Map<String, Object>> mergedEvents = new ArrayList<>();
            if (intervalsEvents.isArray()) {
                for (JsonNode eventNode : intervalsEvents) {
                    Map<String, Object> eventMap = objectMapper.convertValue(eventNode, new TypeReference<Map<String, Object>>() {});
                    
                    // Add deload status and originalFileName from our database
                    Integer eventId = (Integer) eventMap.get("id");
                    String originalFileName = null;
                    if (eventId != null) {
                        Optional<CalendarEvent> storedEvent = calendarEventRepository
                            .findByIntervalsEventIdAndUsername(eventId, username);
                        
                        if (storedEvent.isPresent()) {
                            CalendarEvent stored = storedEvent.get();
                            eventMap.put("isDeloadWeek", stored.getIsDeloadWeek());
                            originalFileName = stored.getOriginalFileName();
                            if (originalFileName != null) {
                                eventMap.put("originalFileName", originalFileName);
                            }
                        } else {
                            eventMap.put("isDeloadWeek", false);
                        }
                    } else {
                        eventMap.put("isDeloadWeek", false);
                    }
                    
                    // Add workout description from summarize.json if available
                    // Use originalFileName (e.g., "VO2Max_TSS_85_v3") for matching
                    if (originalFileName != null) {
                        String description = workoutLibraryService.getWorkoutDescription(originalFileName);
                        if (description != null) {
                            eventMap.put("workoutDescription", description);
                        }
                    }
                    
                    mergedEvents.add(eventMap);
                }
            }

            return mergedEvents;

        } catch (Exception e) {
            log.error("Failed to get calendar events with deload status for user {}: {}", username, e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    /**
     * Delete a calendar event when it's deleted from Intervals.icu
     */
    @Transactional
    public void deleteCalendarEvent(String username, Integer intervalsEventId) {
        try {
            // Check if event exists before deleting
            Optional<CalendarEvent> existingEvent = calendarEventRepository
                .findByIntervalsEventIdAndUsername(intervalsEventId, username);
            
            if (existingEvent.isPresent()) {
                calendarEventRepository.deleteByIntervalsEventIdAndUsername(intervalsEventId, username);
            }
        } catch (Exception e) {
            log.error("Failed to delete calendar event {} for user {}: {}", intervalsEventId, username, e.getMessage(), e);
        }
    }

}
