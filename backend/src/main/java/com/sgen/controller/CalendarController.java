package com.sgen.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.service.CalendarEventService;
import com.sgen.service.IntervalsEventService;
import com.sgen.service.IntervalsWellnessService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class CalendarController {

    private final IntervalsEventService eventService;
    private final IntervalsWellnessService wellnessService;
    private final CalendarEventService calendarEventService;

    @GetMapping("/calendar")
    public ResponseEntity<?> getCalendarEvents(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        try {
            var events = calendarEventService.getCalendarEventsWithDeloadStatus(authentication.getName(), oldest, newest);
            if (events == null) return ResponseEntity.ok(new Object[]{});
            return ResponseEntity.ok(events);
        } catch (Exception e) {
            log.error("Failed to fetch calendar events: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/calendar/event/{eventId}")
    public ResponseEntity<?> getEvent(
            Authentication authentication,
            @PathVariable int eventId) {
        try {
            var event = eventService.fetchEvent(authentication.getName(), eventId);
            if (event == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(event);
        } catch (Exception e) {
            log.error("Failed to fetch event {}: {}", eventId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/calendar/activities")
    public ResponseEntity<?> getCalendarActivities(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        try {
            var activities = eventService.fetchCalendarActivities(authentication.getName(), oldest, newest);
            if (activities == null) return ResponseEntity.ok(new Object[]{});
            return ResponseEntity.ok(activities);
        } catch (Exception e) {
            log.error("Failed to fetch calendar activities: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/calendar/event/{eventId}")
    public ResponseEntity<?> updateEvent(
            Authentication authentication,
            @PathVariable int eventId,
            @RequestBody Map<String, Object> updates) {
        try {
            return ResponseEntity.ok(eventService.updateEvent(authentication.getName(), eventId, updates));
        } catch (Exception e) {
            log.error("Failed to update event {}: {}", eventId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/calendar/event/{eventId}")
    public ResponseEntity<?> deleteEvent(
            Authentication authentication,
            @PathVariable int eventId) {
        try {
            eventService.deleteEvent(authentication.getName(), eventId);
            calendarEventService.deleteCalendarEvent(authentication.getName(), eventId);
            return ResponseEntity.ok(Map.of("success", true, "message", "Event deleted successfully"));
        } catch (Exception e) {
            log.error("Failed to delete event {}: {}", eventId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/calendar/events/batch")
    public ResponseEntity<?> createEventsBatch(
            Authentication authentication,
            @RequestBody Map<String, Object> request) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> events = (List<Map<String, Object>>) request.get("events");
            if (events == null || events.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "No events provided"));
            }

            int deletedCount = 0;
            @SuppressWarnings("unchecked")
            List<Object> deleteEventIds = (List<Object>) request.get("deleteEventIds");
            if (deleteEventIds != null && !deleteEventIds.isEmpty()) {
                for (Object eventIdObj : deleteEventIds) {
                    try {
                        int eventId = ((Number) (eventIdObj instanceof Number ? eventIdObj
                                : Integer.parseInt(eventIdObj.toString()))).intValue();
                        eventService.deleteEvent(authentication.getName(), eventId);
                        calendarEventService.deleteCalendarEvent(authentication.getName(), eventId);
                        deletedCount++;
                        log.info("Deleted existing event {} before creating new one", eventId);
                    } catch (Exception e) {
                        log.warn("Failed to delete event {}: {}", eventIdObj, e.getMessage());
                    }
                }
            }

            List<JsonNode> createdEvents = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            for (Map<String, Object> eventData : events) {
                try {
                    createdEvents.add(eventService.createEvent(authentication.getName(), eventData));
                } catch (Exception e) {
                    log.error("Failed to create event: {}", e.getMessage());
                    errors.add(e.getMessage());
                }
            }

            try {
                List<Map<String, Object>> eventsWithIds = new ArrayList<>();
                for (int i = 0; i < createdEvents.size(); i++) {
                    Map<String, Object> eventWithId = new HashMap<>(events.get(i));
                    eventWithId.put("id", createdEvents.get(i).get("id"));
                    eventsWithIds.add(eventWithId);
                }
                calendarEventService.saveCalendarEvents(authentication.getName(), eventsWithIds);
            } catch (Exception e) {
                log.error("Failed to save calendar events deload status: {}", e.getMessage());
            }

            Map<String, Object> response = new HashMap<>();
            response.put("created", createdEvents);
            response.put("createdCount", createdEvents.size());
            response.put("deletedCount", deletedCount);
            response.put("success", createdEvents.size());
            response.put("failed", errors.size());
            if (!errors.isEmpty()) response.put("errors", errors);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to create events batch: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/wellness")
    public ResponseEntity<List<Map<String, Object>>> fetchWellnessData(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        if (oldest.compareTo(newest) > 0) { String tmp = oldest; oldest = newest; newest = tmp; }
        return ResponseEntity.ok(wellnessService.fetchWellnessData(authentication.getName(), oldest, newest));
    }

    @PutMapping("/wellness/bulk")
    public ResponseEntity<JsonNode> updateWellnessData(
            Authentication authentication,
            @RequestBody List<Map<String, Object>> updates) {
        try {
            return ResponseEntity.ok(wellnessService.updateWellnessData(authentication.getName(), updates));
        } catch (Exception e) {
            log.error("Failed to update wellness data: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/hr-curves")
    public ResponseEntity<?> getHrCurves(
            Authentication authentication,
            @RequestParam String oldest,
            @RequestParam String newest) {
        try {
            var hrCurves = wellnessService.fetchHrCurves(authentication.getName(), oldest, newest);
            if (hrCurves == null) return ResponseEntity.ok(Map.of("hrCurves", new Object[]{}));
            return ResponseEntity.ok(hrCurves);
        } catch (Exception e) {
            log.error("Failed to fetch HR curves: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
