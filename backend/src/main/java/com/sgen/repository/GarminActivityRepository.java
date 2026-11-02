package com.sgen.repository;

import com.sgen.entity.GarminActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface GarminActivityRepository extends JpaRepository<GarminActivity, Long> {
    Optional<GarminActivity> findByUserIdAndGarminActivityId(Long userId, Long garminActivityId);
    Optional<GarminActivity> findBySummaryId(String summaryId);
    List<GarminActivity> findByUserIdAndStartTimeBetweenOrderByStartTimeAsc(Long userId, Long oldest, Long newest);
    List<GarminActivity> findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(Long userId, LocalDateTime from, LocalDateTime to);
    List<GarminActivity> findByUserIdAndStartTimeBetween(Long userId, Long start, Long end);
    void deleteByUserId(Long userId);
    long countByUserId(Long userId);
    @Query("SELECT a.id FROM GarminActivity a WHERE a.userId = :uid")
    List<Long> findIdsByUserId(@Param("uid") Long userId);
}
