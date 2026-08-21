package com.sgen.controller;

import com.sgen.dto.WeatherForecastResponse;
import com.sgen.dto.WeatherLocationRequest;
import com.sgen.dto.WeatherSettingsRequest;
import com.sgen.dto.WeatherStationInfo;
import com.sgen.entity.User;
import com.sgen.entity.WeatherLocation;
import com.sgen.service.WeatherService;
import com.sgen.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/weather")
@RequiredArgsConstructor
@Slf4j
@PreAuthorize("hasRole('USER')")
public class WeatherController {

    private final WeatherService weatherService;
    private final UserService userService;

    @GetMapping("/forecast")
    public ResponseEntity<List<WeatherForecastResponse>> getWeatherForecast(Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            String username = authentication.getName();
            List<WeatherForecastResponse> forecasts = weatherService.getWeatherForecastForUser(userId, username);
            return ResponseEntity.ok(forecasts);
        } catch (Exception e) {
            log.error("Error fetching weather forecast: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/location")
    public ResponseEntity<WeatherLocation> saveWeatherLocation(
            @RequestBody WeatherLocationRequest request,
            Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            WeatherLocation savedLocation = weatherService.saveUserWeatherLocation(userId, request);
            return ResponseEntity.ok(savedLocation);
        } catch (Exception e) {
            log.error("Error saving weather location: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/location")
    public ResponseEntity<WeatherLocation> getUserWeatherLocation(Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            Optional<WeatherLocation> location = weatherService.getUserDefaultLocation(userId);
            return location.map(ResponseEntity::ok)
                          .orElse(ResponseEntity.notFound().build());
        } catch (Exception e) {
            log.error("Error fetching weather location: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/search/{cityName}")
    public ResponseEntity<List<WeatherStationInfo>> searchLocation(
            @PathVariable String cityName,
            Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            List<WeatherStationInfo> stations = weatherService.searchStations(userId, cityName);
            if (stations.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(stations);
        } catch (Exception e) {
            log.error("Error searching weather stations for '{}': {}", cityName, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/settings")
    public ResponseEntity<Map<String, Object>> getWeatherSettings(Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            boolean enabled = weatherService.getOpenMeteoEnabled(userId);
            return ResponseEntity.ok(Map.of("openMeteoEnabled", enabled));
        } catch (Exception e) {
            log.error("Error fetching weather settings: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/settings")
    public ResponseEntity<Map<String, Object>> saveWeatherSettings(
            @RequestBody WeatherSettingsRequest request,
            Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            weatherService.setOpenMeteoEnabled(userId, request.getOpenMeteoEnabled());
            return ResponseEntity.ok(Map.of("openMeteoEnabled", weatherService.getOpenMeteoEnabled(userId)));
        } catch (Exception e) {
            log.error("Error saving weather settings: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/data")
    public ResponseEntity<Void> deleteWeatherData(Authentication authentication) {
        try {
            Long userId = getUserIdFromAuthentication(authentication);
            weatherService.deleteUserWeatherData(userId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            log.error("Error deleting weather data: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private Long getUserIdFromAuthentication(Authentication authentication) {
        User user = userService.getUserEntityByUsername(authentication.getName());
        return user.getId();
    }
}
