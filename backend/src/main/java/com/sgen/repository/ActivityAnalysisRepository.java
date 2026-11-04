package com.sgen.repository;

import com.sgen.entity.ActivityAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.Set;

@Repository
public interface ActivityAnalysisRepository extends JpaRepository<ActivityAnalysis, Long> {

    Optional<ActivityAnalysis> findByUserIdAndActivityId(Long userId, String activityId);

    boolean existsByUserIdAndActivityId(Long userId, String activityId);

    @Query("SELECT a.activityId FROM ActivityAnalysis a WHERE a.userId = :userId")
    Set<String> findActivityIdsByUserId(@Param("userId") Long userId);

    void deleteByUserId(Long userId);
}
