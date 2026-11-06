package com.sgen.repository;

import com.sgen.entity.IntervalsWellness;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface IntervalsWellnessRepository extends JpaRepository<IntervalsWellness, Long> {
    Optional<IntervalsWellness> findByUserIdAndWellnessDate(Long userId, LocalDate wellnessDate);
    List<IntervalsWellness> findByUserIdAndWellnessDateIn(Long userId, List<LocalDate> wellnessDates);
    List<IntervalsWellness> findByUserIdAndWellnessDateBetweenOrderByWellnessDateAsc(
            Long userId, LocalDate from, LocalDate to);
    void deleteByUserId(Long userId);
    long countByUserId(Long userId);
}
