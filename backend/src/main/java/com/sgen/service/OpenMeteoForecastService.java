package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.dto.WeatherForecastResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@Slf4j
public class OpenMeteoForecastService {

    private static final String FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public OpenMeteoForecastService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(30000);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = new ObjectMapper();
    }

    public List<WeatherForecastResponse> getWeatherForecast(Double latitude, Double longitude,
                                                            String cityName, String countryName) {
        String url = UriComponentsBuilder.fromHttpUrl(FORECAST_URL)
                .queryParam("latitude", latitude)
                .queryParam("longitude", longitude)
                .queryParam("current", "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m")
                .queryParam("hourly", "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,cloud_cover,relative_humidity_2m")
                .queryParam("daily", "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max")
                .queryParam("timezone", "auto")
                .queryParam("forecast_days", 10)
                .toUriString();

        try {
            String json = restTemplate.getForObject(url, String.class);
            return parseForecast(json, cityName, countryName);
        } catch (Exception e) {
            log.error("Error fetching OpenMeteo forecast for {},{}: {}", latitude, longitude, e.getMessage(), e);
            throw new RuntimeException("Failed to fetch OpenMeteo forecast", e);
        }
    }

    private List<WeatherForecastResponse> parseForecast(String json, String cityName, String countryName) throws Exception {
        JsonNode root = objectMapper.readTree(json);
        JsonNode daily = root.path("daily");
        JsonNode hourly = root.path("hourly");
        JsonNode current = root.path("current");

        List<String> dailyTimes = new ArrayList<>();
        for (JsonNode t : daily.path("time")) {
            dailyTimes.add(t.asText());
        }

        Map<LocalDate, List<HourEntry>> byDay = new LinkedHashMap<>();
        if (hourly.isObject()) {
            JsonNode hTime = hourly.path("time");
            for (int i = 0; i < hTime.size(); i++) {
                LocalDateTime dt = LocalDateTime.parse(hTime.get(i).asText(), DateTimeFormatter.ISO_DATE_TIME);
                byDay.computeIfAbsent(dt.toLocalDate(), d -> new ArrayList<>())
                        .add(new HourEntry(
                                hourly.path("temperature_2m").get(i).asDouble(),
                                hourly.path("cloud_cover").get(i).asDouble()
                        ));
            }
        }

        double currentTemp = current.path("temperature_2m").asDouble();

        List<WeatherForecastResponse> result = new ArrayList<>();
        for (int i = 0; i < dailyTimes.size(); i++) {
            LocalDate date = LocalDate.parse(dailyTimes.get(i));

            double tMax = getDaily(daily, "temperature_2m_max", i);
            double tMin = getDaily(daily, "temperature_2m_min", i);
            int wmoCode = getDailyInt(daily, "weather_code", i);
            double precipSum = getDaily(daily, "precipitation_sum", i);
            int precipProb = getDailyInt(daily, "precipitation_probability_max", i);
            double windSpeed = getDaily(daily, "wind_speed_10m_max", i);
            double windDir = getDaily(daily, "wind_direction_10m_dominant", i);
            double windGust = getDaily(daily, "wind_gusts_10m_max", i);

            List<HourEntry> hours = byDay.getOrDefault(date, List.of());
            double cloudAvg = hours.stream()
                    .mapToDouble(HourEntry::cloudCover)
                    .filter(v -> v >= 0)
                    .average().orElse(0);

            int cloudOktas = (int) Math.round(cloudAvg / 12.5);
            int smhiSymbol = mapWmoToSmhiSymbol(wmoCode);

            WeatherForecastResponse.WeatherForecastResponseBuilder builder = WeatherForecastResponse.builder()
                    .forecastDate(date.atTime(12, 0))
                    .temperatureMax(tMax)
                    .temperatureMin(tMin)
                    .weatherCode(wmoCode)
                    .weatherDescription(getWmoDescription(wmoCode))
                    .windSpeed(windSpeed)
                    .windDirection((int) Math.round(windDir))
                    .windGust(windGust > 0 ? windGust : null)
                    .precipitationSum(Math.round(precipSum * 10.0) / 10.0)
                    .precipitationProbability(precipProb)
                    .cloudCover(cloudOktas)
                    .thunderstormProbability(0)
                    .symbolCode(smhiSymbol)
                    .cityName(cityName)
                    .countryName(countryName);

            if (i == 0) {
                builder.currentTemperature(currentTemp);
            }

            result.add(builder.build());
            if (result.size() == 10) break;
        }

        return result;
    }

    private double getDaily(JsonNode daily, String field, int idx) {
        JsonNode arr = daily.path(field);
        if (arr.isArray() && idx < arr.size()) {
            return arr.get(idx).asDouble(0);
        }
        return 0;
    }

    private int getDailyInt(JsonNode daily, String field, int idx) {
        JsonNode arr = daily.path(field);
        if (arr.isArray() && idx < arr.size()) {
            return arr.get(idx).asInt(0);
        }
        return 0;
    }

    private record HourEntry(double temperature, double cloudCover) {}

    private int mapWmoToSmhiSymbol(int wmoCode) {
        return switch (wmoCode) {
            case 0 -> 1;   // Clear
            case 1 -> 2;   // Mainly clear
            case 2 -> 3;   // Partly cloudy
            case 3, 38 -> 6; // Overcast / Dust/sand whirls (overcast-like)
            case 45, 48 -> 7; // Fog / rime fog
            case 51, 56 -> 12; // Light drizzle / freezing drizzle
            case 53 -> 13;   // Moderate drizzle
            case 55, 57 -> 14; // Dense drizzle / freezing drizzle
            case 61 -> 18;   // Slight rain
            case 63 -> 19;   // Moderate rain
            case 65 -> 20;   // Heavy rain
            case 66, 67 -> 23; // Freezing rain
            case 71 -> 25;   // Slight snow
            case 73 -> 26;   // Moderate snow
            case 75, 77 -> 27; // Heavy snow / snow grains
            case 80 -> 8;    // Slight rain showers
            case 81 -> 9;    // Moderate rain showers
            case 82 -> 10;   // Violent rain showers
            case 85 -> 15;   // Slight snow showers
            case 86 -> 16;   // Moderate snow showers
            case 87 -> 17;   // Heavy snow showers
            case 95, 96, 99 -> 11; // Thunderstorm
            default -> 5;    // Cloudy fallback
        };
    }

    private String getWmoDescription(int wmoCode) {
        return switch (wmoCode) {
            case 0 -> "Clear sky";
            case 1 -> "Mainly clear";
            case 2 -> "Partly cloudy";
            case 3 -> "Overcast";
            case 45 -> "Fog";
            case 48 -> "Depositing rime fog";
            case 51 -> "Light drizzle";
            case 53 -> "Moderate drizzle";
            case 55 -> "Dense drizzle";
            case 56 -> "Light freezing drizzle";
            case 57 -> "Dense freezing drizzle";
            case 61 -> "Slight rain";
            case 63 -> "Moderate rain";
            case 65 -> "Heavy rain";
            case 66 -> "Light freezing rain";
            case 67 -> "Heavy freezing rain";
            case 71 -> "Slight snow";
            case 73 -> "Moderate snow";
            case 75 -> "Heavy snow";
            case 77 -> "Snow grains";
            case 80 -> "Slight rain showers";
            case 81 -> "Moderate rain showers";
            case 82 -> "Violent rain showers";
            case 85 -> "Slight snow showers";
            case 86 -> "Moderate snow showers";
            case 87 -> "Heavy snow showers";
            case 95 -> "Thunderstorm";
            case 96 -> "Thunderstorm with slight hail";
            case 99 -> "Thunderstorm with heavy hail";
            default -> "Unknown";
        };
    }
}
