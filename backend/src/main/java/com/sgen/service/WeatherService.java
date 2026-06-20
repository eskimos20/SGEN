package com.sgen.service;

import com.sgen.dto.WeatherForecastResponse;
import com.sgen.dto.WeatherLocationRequest;
import com.sgen.entity.User;
import com.sgen.entity.WeatherForecast;
import com.sgen.entity.WeatherLocation;
import com.sgen.repository.WeatherForecastRepository;
import com.sgen.repository.WeatherLocationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class WeatherService {

    // Cache weather data for 1 hour (SMHI updates approximately hourly)
    private static final long WEATHER_CACHE_HOURS = 1;

    private final WeatherLocationRepository weatherLocationRepository;
    private final WeatherForecastRepository weatherForecastRepository;
    private final SmhiForecastService smhiForecastService;

    @Transactional
    public WeatherLocation saveUserWeatherLocation(Long userId, WeatherLocationRequest request) {
        // If this is set as default, remove default flag from other locations
        if (Boolean.TRUE.equals(request.getIsDefault())) {
            weatherLocationRepository.findByUserIdAndIsDefaultTrue(userId)
                .ifPresent(existing -> {
                    existing.setIsDefault(false);
                    weatherLocationRepository.save(existing);
                });
        }

        WeatherLocation location = WeatherLocation.builder()
            .user(User.builder().id(userId).build())
            .latitude(request.getLatitude())
            .longitude(request.getLongitude())
            .cityName(request.getCityName())
            .countryName(request.getCountryName())
            .timezone(request.getTimezone())
            .isDefault(Optional.ofNullable(request.getIsDefault()).orElse(true))
            .build();

        return weatherLocationRepository.save(location);
    }

    @Transactional
    public List<WeatherForecastResponse> getWeatherForecastForUser(Long userId, String username) {
        // Get user's default weather location(s) - handle duplicates
        List<WeatherLocation> locations = weatherLocationRepository.findAllByUserIdAndIsDefaultTrue(userId);

        WeatherLocation location;
        if (locations.isEmpty()) {
            log.info("No default weather location found for user {}, using Luleå, Sweden as default", userId);
            // Create default location for Luleå, Sweden
            location = WeatherLocation.builder()
                .user(User.builder().id(userId).build())
                .latitude(65.58415)
                .longitude(22.15465)
                .cityName("Luleå")
                .countryName("Sweden")
                .timezone("Europe/Stockholm")
                .isDefault(true)
                .build();

            // Save the default location
            location = weatherLocationRepository.save(location);
        } else {
            // Use the first default location found
            location = locations.get(0);

            // Clean up duplicate default locations
            if (locations.size() > 1) {
                log.warn("Cleaning up {} duplicate default locations for user {}", locations.size() - 1, userId);
                for (int i = 1; i < locations.size(); i++) {
                    WeatherLocation duplicate = locations.get(i);
                    duplicate.setIsDefault(false);
                    weatherLocationRepository.save(duplicate);
                    log.info("Marked duplicate location ID {} as non-default", duplicate.getId());
                }
            }
        }

        // Check if we have fresh cached data (less than 1 hour old) based on when it was fetched
        LocalDateTime futureCutoff = LocalDateTime.now().minusDays(1); // include today's forecasts
        List<WeatherForecast> cachedForecasts = weatherForecastRepository
                .findByUserIdAndForecastDateAfterOrderByForecastDateAsc(userId, futureCutoff);

        if (!cachedForecasts.isEmpty()) {
            // Check freshness by createdAt (when data was actually fetched from API)
            LocalDateTime oldestCreatedAt = cachedForecasts.stream()
                    .map(WeatherForecast::getCreatedAt)
                    .filter(t -> t != null)
                    .min(LocalDateTime::compareTo)
                    .orElse(null);

            if (oldestCreatedAt != null) {
                long hoursSinceFetch = ChronoUnit.HOURS.between(oldestCreatedAt, LocalDateTime.now());
                if (hoursSinceFetch < WEATHER_CACHE_HOURS) {
                    log.debug("Returning cached weather data for user {} (fetched {} hours ago, {} days)",
                            userId, hoursSinceFetch, cachedForecasts.size());
                    return cachedForecasts.stream()
                            .map(this::convertToResponse)
                            .collect(Collectors.toList());
                }
            }
        }

        // Cache is stale or empty - fetch fresh data from SMHI
        try {
            List<WeatherForecastResponse> newForecasts = smhiForecastService.getWeatherForecast(
                location.getLatitude(),
                location.getLongitude(),
                location.getCityName(),
                location.getCountryName()
            );

            // Only delete and save if we got new data successfully
            if (!newForecasts.isEmpty()) {
                try {
                    // Clear old forecasts and save new ones
                    weatherForecastRepository.deleteByUserId(userId);
                    weatherForecastRepository.flush();

                    // Save to database
                    List<WeatherForecast> forecastEntities = newForecasts.stream()
                        .map(response -> convertToEntity(response, userId))
                        .collect(Collectors.toList());

                    weatherForecastRepository.saveAll(forecastEntities);

                    log.info("\"{}\" successfully fetched weather data for \"{}\"", username, location.getCityName());
                } catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
                    // Race condition - another request already updated the data
                    // Just return the new forecasts without saving (data is still fresh from API)
                    log.warn("Concurrent weather update detected for user {}, returning fresh API data", userId);
                }
            }

            return newForecasts;

        } catch (Exception e) {
            log.error("Failed to fetch weather data for user {}: {}", userId, e.getMessage(), e);
            // If API fails but we have stale cached data, return it as fallback
            if (!cachedForecasts.isEmpty()) {
                log.warn("Returning stale cached weather data for user {} due to API failure", userId);
                return cachedForecasts.stream()
                        .map(this::convertToResponse)
                        .collect(Collectors.toList());
            }
            // Return empty list if API fails and no cached data
            return List.of();
        }
    }

    @Transactional
    public Optional<WeatherLocation> getUserDefaultLocation(Long userId) {
        List<WeatherLocation> locations = weatherLocationRepository.findAllByUserIdAndIsDefaultTrue(userId);
        
        if (locations.isEmpty()) {
            // Create and return default Luleå location
            WeatherLocation defaultLocation = WeatherLocation.builder()
                .user(User.builder().id(userId).build())
                .latitude(65.58415)
                .longitude(22.15465)
                .cityName("Luleå")
                .countryName("Sweden")
                .timezone("Europe/Stockholm")
                .isDefault(true)
                .build();
            
            return Optional.of(weatherLocationRepository.save(defaultLocation));
        } else {
            // Return the first default location found
            return Optional.of(locations.get(0));
        }
    }

    @Transactional
    public void deleteUserWeatherData(Long userId) {
        weatherForecastRepository.deleteByUserId(userId);
        weatherLocationRepository.deleteByUserId(userId);
    }

    private WeatherForecast convertToEntity(WeatherForecastResponse response, Long userId) {
        return WeatherForecast.builder()
            .user(User.builder().id(userId).build())
            .forecastDate(response.getForecastDate())
            .temperatureMax(response.getTemperatureMax())
            .temperatureMin(response.getTemperatureMin())
            .weatherDescription(response.getWeatherDescription())
            .windSpeed(response.getWindSpeed())
            .windDirection(response.getWindDirection())
            .windGust(response.getWindGust())
            .precipitationSum(response.getPrecipitationSum())
            .precipitationMin(response.getPrecipitationMin())
            .precipitationMax(response.getPrecipitationMax())
            .precipitationProbability(response.getPrecipitationProbability())
            .cloudCover(response.getCloudCover())
            .thunderstormProbability(response.getThunderstormProbability())
            .symbolCode(response.getSymbolCode())
            .build();
    }

    private WeatherForecastResponse convertToResponse(WeatherForecast forecast) {
        return WeatherForecastResponse.builder()
            .forecastDate(forecast.getForecastDate())
            .temperatureMax(forecast.getTemperatureMax())
            .temperatureMin(forecast.getTemperatureMin())
            .weatherDescription(forecast.getWeatherDescription())
            .windSpeed(forecast.getWindSpeed())
            .windDirection(forecast.getWindDirection())
            .windGust(forecast.getWindGust())
            .precipitationSum(forecast.getPrecipitationSum())
            .precipitationMin(forecast.getPrecipitationMin())
            .precipitationMax(forecast.getPrecipitationMax())
            .precipitationProbability(forecast.getPrecipitationProbability())
            .cloudCover(forecast.getCloudCover())
            .thunderstormProbability(forecast.getThunderstormProbability())
            .symbolCode(forecast.getSymbolCode())
            .build();
    }
}
