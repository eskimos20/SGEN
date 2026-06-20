package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WeatherLocationRequest {
    
    private Double latitude;
    
    private Double longitude;
    
    private String cityName;
    
    private String countryName;
    
    private String timezone;
    
    private Boolean isDefault;
}
