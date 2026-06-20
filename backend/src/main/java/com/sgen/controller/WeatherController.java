package com.sgen.controller;

import com.sgen.dto.WeatherForecastResponse;
import com.sgen.dto.WeatherLocationRequest;
import com.sgen.entity.WeatherLocation;
import com.sgen.entity.User;
import com.sgen.service.SmhiStationService;
import com.sgen.service.WeatherService;
import com.sgen.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/weather")
@RequiredArgsConstructor
@Slf4j
@PreAuthorize("hasRole('USER')")
public class WeatherController {

    private final WeatherService weatherService;
    private final SmhiStationService smhiStationService;
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
    public ResponseEntity<List<SmhiStationService.StationInfo>> searchLocation(@PathVariable String cityName) {
        try {
            List<SmhiStationService.StationInfo> stations = smhiStationService.searchStations(cityName);
            if (stations.isEmpty()) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(stations);
        } catch (Exception e) {
            log.error("Error searching SMHI stations for '{}': {}", cityName, e.getMessage(), e);
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
