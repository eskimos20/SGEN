package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.dto.WeatherStationInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class OpenMeteoStationService {

    private static final String SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public OpenMeteoStationService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(30000);
        this.restTemplate = new RestTemplate(factory);
        this.objectMapper = new ObjectMapper();
    }

    public List<WeatherStationInfo> searchStations(String query) {
        try {
            java.net.URI uri = UriComponentsBuilder.fromUriString(SEARCH_URL)
                    .queryParam("name", query)
                    .queryParam("count", 5)
                    .queryParam("language", "en")
                    .queryParam("format", "json")
                    .build()
                    .encode()
                    .toUri();

            String json = restTemplate.getForObject(uri, String.class);
            return parseStations(json);
        } catch (Exception e) {
            log.error("Error searching OpenMeteo stations for '{}': {}", query, e.getMessage(), e);
            throw new RuntimeException("Failed to search OpenMeteo stations", e);
        }
    }

    private List<WeatherStationInfo> parseStations(String json) throws Exception {
        JsonNode root = objectMapper.readTree(json);
        JsonNode results = root.path("results");
        List<WeatherStationInfo> stations = new ArrayList<>();

        if (results == null || results.isMissingNode() || !results.isArray()) {
            log.warn("OpenMeteo geocoding returned no results array");
            return stations;
        }

        for (JsonNode r : results) {
            String name = r.path("name").asText("");
            String admin1 = r.path("admin1").asText("");
            String country = r.path("country").asText("");
            String displayName;
            if (!admin1.isEmpty() && !admin1.equalsIgnoreCase(name)) {
                displayName = name + ", " + admin1;
            } else if (!country.isEmpty()) {
                displayName = name + ", " + country;
            } else {
                displayName = name;
            }

            WeatherStationInfo info = WeatherStationInfo.builder()
                    .id(r.path("id").asLong())
                    .name(displayName)
                    .latitude(r.path("latitude").asDouble())
                    .longitude(r.path("longitude").asDouble())
                    .active(true)
                    .countryName(country)
                    .timezone(r.path("timezone").asText("UTC"))
                    .build();

            stations.add(info);
        }

        return stations;
    }
}
