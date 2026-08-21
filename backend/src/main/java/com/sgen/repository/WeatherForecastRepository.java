package com.sgen.repository;

import com.sgen.entity.User;
import com.sgen.entity.WeatherForecast;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface WeatherForecastRepository extends JpaRepository<WeatherForecast, Long> {
    
    @Query("SELECT wf FROM WeatherForecast wf WHERE wf.user.id = :userId AND wf.forecastDate >= :startDate ORDER BY wf.forecastDate ASC")
    List<WeatherForecast> findByUserIdAndForecastDateAfterOrderByForecastDateAsc(@Param("userId") Long userId, @Param("startDate") LocalDateTime startDate);
    
    void deleteByUserId(Long userId);
    void deleteByUser(User user);
}
