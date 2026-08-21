package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WeatherStationInfo {

    private Long id;

    private String name;

    private Double latitude;

    private Double longitude;

    private Boolean active;

    private String countryName;

    private String timezone;
}
