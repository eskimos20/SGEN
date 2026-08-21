package com.sgen.controller;

import com.sgen.service.IntervalsGearService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
@Slf4j
public class GearController {

    private final IntervalsGearService gearService;

    @GetMapping("/gear")
    public ResponseEntity<?> getGear(Authentication authentication) {
        try {
            return ResponseEntity.ok(gearService.fetchGear(authentication.getName()));
        } catch (Exception e) {
            log.error("Failed to fetch gear: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/gear")
    public ResponseEntity<?> createGear(
            @RequestBody Map<String, Object> gearData,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(gearService.createGear(authentication.getName(), gearData));
        } catch (Exception e) {
            log.error("Failed to create gear: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/gear/{gearId}")
    public ResponseEntity<?> updateGear(
            @PathVariable String gearId,
            @RequestBody Map<String, Object> gearData,
            Authentication authentication) {
        try {
            return ResponseEntity.ok(gearService.updateGear(authentication.getName(), gearId, gearData));
        } catch (Exception e) {
            log.error("Failed to update gear {}: {}", gearId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/gear/{gearId}")
    public ResponseEntity<?> deleteGear(
            @PathVariable String gearId,
            Authentication authentication) {
        try {
            gearService.deleteGear(authentication.getName(), gearId);
            return ResponseEntity.ok(Map.of("message", "Gear deleted successfully"));
        } catch (Exception e) {
            log.error("Failed to delete gear {}: {}", gearId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/activity/{activityId}/gear")
    public ResponseEntity<?> updateActivityGear(
            @PathVariable String activityId,
            @RequestBody Map<String, String> request,
            Authentication authentication) {
        try {
            String gearId = request.get("gearId");
            return ResponseEntity.ok(gearService.updateActivityGear(authentication.getName(), activityId, gearId));
        } catch (Exception e) {
            log.error("Failed to update activity {} gear: {}", activityId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
