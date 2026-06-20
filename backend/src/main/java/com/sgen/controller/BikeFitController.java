package com.sgen.controller;

import com.sgen.dto.BikeFitSettingsDTO;
import com.sgen.service.BikeFitService;
import com.sgen.service.BikeFitAnalysisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/bikefit")
@RequiredArgsConstructor
@Slf4j
@PreAuthorize("hasRole('USER')")
public class BikeFitController {

    private final BikeFitService bikeFitService;
    private final BikeFitAnalysisService bikeFitAnalysisService;

    @GetMapping("/settings")
    public ResponseEntity<BikeFitSettingsDTO> getSettings(Authentication authentication) {
        try {
            String username = authentication.getName();
            BikeFitSettingsDTO settings = bikeFitService.getSettings(username);
            return ResponseEntity.ok(settings);
        } catch (Exception e) {
            log.error("Error getting BikeFit settings", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/settings")
    public ResponseEntity<BikeFitSettingsDTO> saveSettings(
            Authentication authentication,
            @RequestBody BikeFitSettingsDTO settingsDTO) {
        try {
            String username = authentication.getName();
            BikeFitSettingsDTO savedSettings = bikeFitService.saveSettings(username, settingsDTO);
            return ResponseEntity.ok(savedSettings);
        } catch (Exception e) {
            log.error("Error saving BikeFit settings", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/ai-analysis")
    public ResponseEntity<Map<String, Object>> getAIAnalysis(@RequestBody Map<String, Object> request) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Number> angles = (Map<String, Number>) request.get("angles");
            String ridingStyle = (String) request.get("ridingStyle");
            
            String analysis = bikeFitAnalysisService.generatePersonalizedRecommendations(angles, ridingStyle);
            
            Map<String, Object> response = new HashMap<>();
            response.put("analysis", analysis);
            response.put("timestamp", System.currentTimeMillis());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating AI analysis", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
