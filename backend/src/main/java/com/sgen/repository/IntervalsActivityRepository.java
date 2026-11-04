package com.sgen.repository;

import com.sgen.entity.IntervalsActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
public interface IntervalsActivityRepository extends JpaRepository<IntervalsActivity, Long> {
    Optional<IntervalsActivity> findByUserIdAndActivityId(Long userId, String activityId);
    List<IntervalsActivity> findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalDesc(
            Long userId, LocalDateTime from, LocalDateTime to);
    void deleteByUserId(Long userId);
    void deleteByUserIdAndActivityId(Long userId, String activityId);
    long countByUserId(Long userId);

    /** Id-only projection — avoids loading MEDIUMTEXT payloads for sweeps. */
    @Query("SELECT a.activityId FROM IntervalsActivity a WHERE a.userId = :userId")
    List<String> findActivityIdsByUserId(@Param("userId") Long userId);

    /** Chronological variant — record tables must grow in date order. */
    @Query("SELECT a.activityId FROM IntervalsActivity a WHERE a.userId = :userId ORDER BY a.startDateLocal ASC")
    List<String> findActivityIdsByUserIdOrderByDate(@Param("userId") Long userId);

    @Query("SELECT DISTINCT a.userId FROM IntervalsActivity a")
    Set<Long> findDistinctUserIds();
}
