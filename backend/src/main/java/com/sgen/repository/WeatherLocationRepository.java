package com.sgen.repository;

import com.sgen.entity.User;
import com.sgen.entity.WeatherLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WeatherLocationRepository extends JpaRepository<WeatherLocation, Long> {
    
    Optional<WeatherLocation> findByUserIdAndIsDefaultTrue(Long userId);
    
    List<WeatherLocation> findAllByUserIdAndIsDefaultTrue(Long userId);
    
    void deleteByUserId(Long userId);
    void deleteByUser(User user);
}
