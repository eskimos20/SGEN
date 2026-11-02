package com.sgen.repository;

import com.sgen.entity.GarminConnection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface GarminConnectionRepository extends JpaRepository<GarminConnection, Long> {
    Optional<GarminConnection> findByUserId(Long userId);
    Optional<GarminConnection> findByGarminUserId(String garminUserId);
    void deleteByUserId(Long userId);
    void deleteByGarminUserId(String garminUserId);
}
