package com.sgen.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "weather_forecasts", indexes = {
    @Index(name = "idx_weather_user_id", columnList = "user_id"),
    @Index(name = "idx_weather_forecast_date", columnList = "forecast_date"),
    @Index(name = "idx_weather_user_forecast", columnList = "user_id, forecast_date")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WeatherForecast {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "forecast_date", nullable = false)
    private LocalDateTime forecastDate;

    @Column(name = "temperature_max")
    private Double temperatureMax;

    @Column(name = "temperature_min")
    private Double temperatureMin;

    @Column(name = "weather_code")
    private Integer weatherCode;

    @Column(name = "weather_description")
    private String weatherDescription;

    @Column(name = "wind_speed")
    private Double windSpeed;

    @Column(name = "wind_direction")
    private Integer windDirection;

    @Column(name = "wind_gust")
    private Double windGust;

    @Column(name = "precipitation_sum")
    private Double precipitationSum;

    @Column(name = "precipitation_min")
    private Double precipitationMin;

    @Column(name = "precipitation_max")
    private Double precipitationMax;

    @Column(name = "precipitation_probability")
    private Integer precipitationProbability;

    @Column(name = "cloud_cover")
    private Integer cloudCover;

    @Column(name = "thunderstorm_probability")
    private Integer thunderstormProbability;

    @Column(name = "symbol_code")
    private Integer symbolCode;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
