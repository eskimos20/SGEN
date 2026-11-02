package com.sgen.repository;

import com.sgen.entity.IntervalsActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface IntervalsActivityRepository extends JpaRepository<IntervalsActivity, Long> {
    Optional<IntervalsActivity> findByUserIdAndActivityId(Long userId, String activityId);
    List<IntervalsActivity> findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(
            Long userId, LocalDateTime from, LocalDateTime to);
    void deleteByUserId(Long userId);
}
