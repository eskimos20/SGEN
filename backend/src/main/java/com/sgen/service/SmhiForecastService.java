package com.sgen.service;

import com.sgen.dto.WeatherForecastResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@Slf4j
public class SmhiForecastService {

    private static final String FORECAST_URL =
        "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/%s/lat/%s/data.json";

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public SmhiForecastService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(30000);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = new ObjectMapper();
    }

    public List<WeatherForecastResponse> getWeatherForecast(Double latitude, Double longitude,
                                                             String cityName, String countryName) {
        String lon = String.format(Locale.US, "%.2f", longitude);
        String lat = String.format(Locale.US, "%.2f", latitude);
        String url = String.format(FORECAST_URL, lon, lat);

        try {
            String json = restTemplate.getForObject(url, String.class);
            return parseForecast(json, cityName, countryName);
        } catch (Exception e) {
            log.error("Error fetching SMHI forecast for {},{}: {}", lat, lon, e.getMessage(), e);
            throw new RuntimeException("Failed to fetch SMHI forecast", e);
        }
    }

    private List<WeatherForecastResponse> parseForecast(String json, String cityName, String countryName) {
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode timeSeries = root.path("timeSeries");

            Map<LocalDate, List<JsonNode>> byDay = new LinkedHashMap<>();
            for (JsonNode entry : timeSeries) {
                ZonedDateTime zdt = ZonedDateTime.parse(entry.path("time").asText(), DateTimeFormatter.ISO_DATE_TIME);
                LocalDate date = zdt.toLocalDate();
                byDay.computeIfAbsent(date, d -> new ArrayList<>()).add(entry);
            }

            List<WeatherForecastResponse> result = new ArrayList<>();
            for (Map.Entry<LocalDate, List<JsonNode>> dayEntry : byDay.entrySet()) {
                LocalDate date = dayEntry.getKey();
                List<JsonNode> entries = dayEntry.getValue();

                result.add(aggregateDay(date, entries, cityName, countryName));

                if (result.size() == 10) break;
            }
            return result;
        } catch (Exception e) {
            log.error("Error parsing SMHI forecast: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to parse SMHI forecast", e);
        }
    }

    private WeatherForecastResponse aggregateDay(LocalDate date, List<JsonNode> entries,
                                                  String cityName, String countryName) {
        DoubleSummaryStatistics tempStats = entries.stream()
            .mapToDouble(e -> getData(e, "air_temperature"))
            .filter(v -> v > -999)
            .summaryStatistics();

        double windMax = entries.stream()
            .mapToDouble(e -> getData(e, "wind_speed"))
            .filter(v -> v >= 0)
            .max().orElse(0);

        double windGustMax = entries.stream()
            .mapToDouble(e -> getData(e, "wind_speed_of_gust"))
            .filter(v -> v >= 0)
            .max().orElse(0);

        double windDirAvg = entries.stream()
            .mapToDouble(e -> getData(e, "wind_from_direction"))
            .filter(v -> v >= 0)
            .average().orElse(0);

        double precipSum = entries.stream()
            .mapToDouble(e -> getData(e, "precipitation_amount_mean"))
            .filter(v -> v >= 0)
            .sum();

        double precipMin = entries.stream()
            .mapToDouble(e -> getData(e, "precipitation_amount_min"))
            .filter(v -> v >= 0)
            .min().orElse(0);

        double precipMax = entries.stream()
            .mapToDouble(e -> getData(e, "precipitation_amount_max"))
            .filter(v -> v >= 0)
            .max().orElse(0);

        int precipProbMax = entries.stream()
            .mapToInt(e -> getIntData(e, "probability_of_precipitation"))
            .filter(v -> v >= 0)
            .max().orElse(0);

        double cloudAvg = entries.stream()
            .mapToDouble(e -> getData(e, "cloud_area_fraction"))
            .filter(v -> v >= 0)
            .average().orElse(0);

        int thunderMax = entries.stream()
            .mapToInt(e -> getIntData(e, "thunderstorm_probability"))
            .filter(v -> v >= 0)
            .max().orElse(0);

        int symbolCode = entries.stream()
            .filter(e -> isDay(e))
            .mapToInt(e -> getIntData(e, "symbol_code"))
            .filter(v -> v > 0)
            .findFirst()
            .orElseGet(() -> entries.stream()
                .mapToInt(e -> getIntData(e, "symbol_code"))
                .filter(v -> v > 0)
                .findFirst().orElse(1));

        double currentTemp = entries.isEmpty() ? tempStats.getAverage()
            : getData(entries.get(0), "air_temperature");

        return WeatherForecastResponse.builder()
            .forecastDate(date.atTime(12, 0))
            .temperatureMax(tempStats.getCount() > 0 ? tempStats.getMax() : 0)
            .temperatureMin(tempStats.getCount() > 0 ? tempStats.getMin() : 0)
            .currentTemperature(currentTemp)
            .windSpeed(windMax)
            .windDirection((int) Math.round(windDirAvg))
            .windGust(windGustMax > 0 ? windGustMax : null)
            .precipitationSum(Math.round(precipSum * 10.0) / 10.0)
            .precipitationMin(precipMin > 0 && precipMin < precipMax ? Math.round(precipMin * 10.0) / 10.0 : null)
            .precipitationMax(precipMax > 0 && precipMax > precipMin ? Math.round(precipMax * 10.0) / 10.0 : null)
            .precipitationProbability(precipProbMax)
            .cloudCover((int) Math.round(cloudAvg))
            .thunderstormProbability(thunderMax)
            .symbolCode(symbolCode)
            .weatherDescription(getSymbolDescription(symbolCode))
            .cityName(cityName)
            .countryName(countryName)
            .build();
    }

    private double getData(JsonNode entry, String param) {
        JsonNode data = entry.path("data");
        if (data.has(param)) return data.path(param).asDouble(-999);
        return -999;
    }

    private int getIntData(JsonNode entry, String param) {
        JsonNode data = entry.path("data");
        if (data.has(param)) return data.path(param).asInt(-1);
        return -1;
    }

    private boolean isDay(JsonNode entry) {
        try {
            ZonedDateTime zdt = ZonedDateTime.parse(entry.path("time").asText(), DateTimeFormatter.ISO_DATE_TIME);
            int hour = zdt.getHour();
            return hour >= 8 && hour <= 18;
        } catch (Exception e) {
            return false;
        }
    }

    private String getSymbolDescription(int symbolCode) {
        return switch (symbolCode) {
            case 1 -> "Clear";
            case 2 -> "Nearly clear";
            case 3 -> "Variable cloudiness";
            case 4 -> "Half cloudy";
            case 5 -> "Cloudy";
            case 6 -> "Overcast";
            case 7 -> "Fog";
            case 8 -> "Light rain showers";
            case 9 -> "Moderate rain showers";
            case 10 -> "Heavy rain showers";
            case 11 -> "Thunderstorm";
            case 12 -> "Light sleet showers";
            case 13 -> "Moderate sleet showers";
            case 14 -> "Heavy sleet showers";
            case 15 -> "Light snow showers";
            case 16 -> "Moderate snow showers";
            case 17 -> "Heavy snow showers";
            case 18 -> "Light rain";
            case 19 -> "Moderate rain";
            case 20 -> "Heavy rain";
            case 21 -> "Thunder";
            case 22 -> "Light sleet";
            case 23 -> "Moderate sleet";
            case 24 -> "Heavy sleet";
            case 25 -> "Light snowfall";
            case 26 -> "Moderate snowfall";
            case 27 -> "Heavy snowfall";
            default -> "Unknown";
        };
    }
}
