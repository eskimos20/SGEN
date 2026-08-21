package com.sgen.controller;

import com.sgen.entity.GearMaintenance;
import com.sgen.service.GearMaintenanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/gear-maintenance")
@RequiredArgsConstructor
@Slf4j
@PreAuthorize("hasRole('USER')")
public class GearMaintenanceController {
    
    private final GearMaintenanceService maintenanceService;
    
    @PostMapping
    public ResponseEntity<?> createMaintenance(
            @RequestBody GearMaintenance maintenance,
            Authentication authentication) {
        try {
            GearMaintenance created = maintenanceService.createMaintenance(
                    authentication.getName(), maintenance);
            return ResponseEntity.ok(created);
        } catch (Exception e) {
            log.error("Failed to create maintenance: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
    
    @GetMapping("/gear/{gearId}")
    public ResponseEntity<?> getMaintenanceForGear(
            @PathVariable String gearId,
            Authentication authentication) {
        try {
            List<GearMaintenance> maintenance = maintenanceService.getMaintenanceForGear(
                    authentication.getName(), gearId);
            return ResponseEntity.ok(maintenance);
        } catch (Exception e) {
            log.error("Failed to get maintenance: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
    
    @GetMapping
    public ResponseEntity<?> getAllMaintenance(Authentication authentication) {
        try {
            List<GearMaintenance> maintenance = maintenanceService.getAllMaintenance(
                    authentication.getName());
            return ResponseEntity.ok(maintenance);
        } catch (Exception e) {
            log.error("Failed to get all maintenance: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<?> updateMaintenance(
            @PathVariable Long id,
            @RequestBody GearMaintenance maintenance,
            Authentication authentication) {
        try {
            GearMaintenance updated = maintenanceService.updateMaintenance(
                    authentication.getName(), id, maintenance);
            return ResponseEntity.ok(updated);
        } catch (Exception e) {
            log.error("Failed to update maintenance: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteMaintenance(
            @PathVariable Long id,
            Authentication authentication) {
        try {
            maintenanceService.deleteMaintenance(authentication.getName(), id);
            return ResponseEntity.ok(Map.of("message", "Maintenance deleted"));
        } catch (Exception e) {
            log.error("Failed to delete maintenance: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
