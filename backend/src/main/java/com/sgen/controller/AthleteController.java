package com.sgen.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.service.IntervalsAthleteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class AthleteController {

    private final IntervalsAthleteService athleteService;

    @GetMapping("/athlete-profile")
    public ResponseEntity<Map<String, Object>> getAthleteProfile(Authentication authentication) {
        return ResponseEntity.ok(athleteService.getAthleteProfile(authentication.getName()));
    }

    @PutMapping("/athlete/profile")
    public ResponseEntity<JsonNode> updateAthleteProfile(
            Authentication authentication,
            @RequestBody Map<String, Object> updates) {
        try {
            return ResponseEntity.ok(athleteService.updateAthleteProfile(authentication.getName(), updates));
        } catch (Exception e) {
            log.error("Failed to update athlete profile: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/athlete/settings")
    public ResponseEntity<JsonNode> updateAthleteSettings(
            Authentication authentication,
            @RequestBody Map<String, Object> updates) {
        try {
            return ResponseEntity.ok(athleteService.updateAthleteSettings(authentication.getName(), updates));
        } catch (Exception e) {
            log.error("Failed to update athlete settings: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/athlete/sport-settings")
    public ResponseEntity<JsonNode> updateAthleteSportSettings(
            Authentication authentication,
            @RequestBody Object updates) {
        try {
            return ResponseEntity.ok(athleteService.updateAthleteSportSettings(authentication.getName(), updates));
        } catch (Exception e) {
            log.error("Failed to update athlete sport settings: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/athlete/sport-settings")
    public ResponseEntity<JsonNode> createAthleteSportSettings(
            Authentication authentication,
            @RequestBody Object sportData) {
        try {
            return ResponseEntity.ok(athleteService.createAthleteSportSettings(authentication.getName(), sportData));
        } catch (Exception e) {
            log.error("Failed to create athlete sport settings: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/athlete/sport-settings/{sportId}")
    public ResponseEntity<Void> deleteAthleteSportSettings(
            Authentication authentication,
            @PathVariable int sportId) {
        try {
            athleteService.deleteAthleteSportSettings(authentication.getName(), sportId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Failed to delete athlete sport settings: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/athlete/sport-settings/{sportId}/matching-activities")
    public ResponseEntity<JsonNode> getMatchingActivities(
            Authentication authentication,
            @PathVariable int sportId) {
        try {
            return ResponseEntity.ok(athleteService.getMatchingActivitiesForSportSettings(authentication.getName(), sportId));
        } catch (Exception e) {
            log.error("Failed to get matching activities for sport {}: {}", sportId, e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/athlete/sport-settings/{sportId}/apply")
    public ResponseEntity<JsonNode> applySettingsToActivities(
            Authentication authentication,
            @PathVariable int sportId) {
        try {
            return ResponseEntity.ok(athleteService.applySettingsToActivities(authentication.getName(), sportId));
        } catch (Exception e) {
            log.error("Failed to apply sport settings {} to activities: {}", sportId, e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/sport-types")
    public ResponseEntity<List<String>> getAvailableActivityTypes() {
        return ResponseEntity.ok(athleteService.getAvailableActivityTypes());
    }
}
