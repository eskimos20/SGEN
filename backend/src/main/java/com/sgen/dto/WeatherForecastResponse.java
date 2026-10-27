package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WeatherForecastResponse {
    
    private Long id;
    
    private LocalDateTime forecastDate;
    
    private Double temperatureMax;
    
    private Double temperatureMin;

    private LocalTime sunrise;

    private LocalTime sunset;
    
    private Double currentTemperature;
    
    private Integer weatherCode;
    
    private String weatherDescription;
    
    private Double windSpeed;
    
    private Integer windDirection;

    private Double windGust;

    private Double currentWindSpeed;

    private Integer currentWindDirection;

    private Double currentWindGust;

    private Double precipitationSum;

    private Double precipitationMin;

    private Double precipitationMax;

    private Integer precipitationProbability;
    
    private Integer cloudCover;
    
    private Integer thunderstormProbability;
    
    private Integer symbolCode;
    
    private String cityName;
    
    private String countryName;
}
