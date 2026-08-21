package com.sgen.repository;

import com.sgen.entity.BikeFitSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BikeFitSettingsRepository extends JpaRepository<BikeFitSettings, Long> {
    Optional<BikeFitSettings> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
