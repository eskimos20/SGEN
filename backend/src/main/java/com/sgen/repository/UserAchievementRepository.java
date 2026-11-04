package com.sgen.repository;

import com.sgen.entity.User;
import com.sgen.entity.UserAchievement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserAchievementRepository extends JpaRepository<UserAchievement, Long> {
    
    List<UserAchievement> findByUserAndStatusOrderByAchievementDateDesc(
            User user, 
            UserAchievement.AchievementStatus status
    );
    
    Optional<UserAchievement> findByUserAndActivityIdAndAchievementType(
            User user, 
            String activityId, 
            String achievementType
    );
    
    boolean existsByUserAndActivityIdAndAchievementType(
            User user,
            String activityId,
            String achievementType
    );

    /** Locally detected achievements within a date range (any status). */
    List<UserAchievement> findByUserAndAchievementDateBetweenOrderByAchievementDateDesc(
            User user,
            java.time.LocalDate from,
            java.time.LocalDate to
    );

    void deleteByUser(User user);

    /** Delete every achievement row tied to one activity — used when the
     *  activity itself is deleted. */
    void deleteByUserAndActivityId(User user, String activityId);

    /** Delete only locally detected achievements (BEST_POWER/BEST_PACE/ftp_up/lthr_up
     *  ids) — Intervals-sourced achievements carry their own ids and are left alone. */
    void deleteByUserAndActivityIdAndAchievementIdIn(
            User user, String activityId, java.util.Collection<String> achievementIds);
}
