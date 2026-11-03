package com.sgen.repository;

import com.sgen.entity.UserDailyLoad;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserDailyLoadRepository extends JpaRepository<UserDailyLoad, Long> {
    Optional<UserDailyLoad> findByUserIdAndLoadDateAndSource(Long userId, LocalDate loadDate, String source);
    List<UserDailyLoad> findByUserIdAndLoadDateBetween(Long userId, LocalDate from, LocalDate to);
    List<UserDailyLoad> findByUserIdAndLoadDateGreaterThanEqual(Long userId, LocalDate from);
    void deleteByUserId(Long userId);
    void deleteByUserIdAndLoadDateAndSource(Long userId, LocalDate loadDate, String source);
    @Query("SELECT COALESCE(SUM(l.activityCount),0) FROM UserDailyLoad l WHERE l.userId = :uid AND l.source = :src")
    Long sumActivityCount(@Param("uid") Long userId, @Param("src") String source);
}
