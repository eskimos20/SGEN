package com.sgen.repository;

import com.sgen.entity.GarminWellness;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface GarminWellnessRepository extends JpaRepository<GarminWellness, Long> {
    Optional<GarminWellness> findBySummaryId(String summaryId);
    List<GarminWellness> findByUserIdAndSummaryTypeAndSummaryDateBetweenOrderBySummaryDateAsc(Long userId, String summaryType, LocalDate from, LocalDate to);
    List<GarminWellness> findByUserIdAndSummaryDateBetween(Long userId, LocalDate from, LocalDate to);
    void deleteByUserId(Long userId);
}
