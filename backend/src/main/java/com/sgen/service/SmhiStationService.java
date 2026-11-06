package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.dto.WeatherStationInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class SmhiStationService {

    private static final String STATIONS_URL =
        "https://opendata-download-metobs.smhi.se/api/version/latest/parameter/1.json";

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;


    public List<WeatherStationInfo> searchStations(String query) {
        try {
            String json = restTemplate.getForObject(STATIONS_URL, String.class);
            return parseStations(json, query.toLowerCase().trim());
        } catch (Exception e) {
            log.error("Error searching SMHI stations for '{}': {}", query, e.getMessage(), e);
            throw new RuntimeException("Failed to search SMHI stations", e);
        }
    }

    private List<WeatherStationInfo> parseStations(String json, String query) throws Exception {
        JsonNode root = objectMapper.readTree(json);
        JsonNode stations = root.path("station");
        List<WeatherStationInfo> results = new ArrayList<>();

        for (JsonNode s : stations) {
            String name = s.path("name").asText("");
            if (name.toLowerCase().contains(query)) {
                results.add(WeatherStationInfo.builder()
                    .id(s.path("id").asLong())
                    .name(name)
                    .latitude(s.path("latitude").asDouble())
                    .longitude(s.path("longitude").asDouble())
                    .active(s.path("active").asBoolean(false))
                    .countryName("Sweden")
                    .timezone("Europe/Stockholm")
                    .build());
            }
        }

        results.sort(Comparator
            .comparing((WeatherStationInfo si) -> si.getActive() ? 0 : 1)
            .thenComparing(si -> si.getName().length()));

        return results.subList(0, Math.min(results.size(), 5));
    }
}
