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
    
    void deleteByUser(User user);
}
