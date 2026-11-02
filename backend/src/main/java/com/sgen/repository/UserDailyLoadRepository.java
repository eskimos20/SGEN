package com.sgen.repository;

import com.sgen.entity.UserDailyLoad;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserDailyLoadRepository extends JpaRepository<UserDailyLoad, Long> {
    Optional<UserDailyLoad> findByUserIdAndLoadDateAndSource(Long userId, LocalDate loadDate, String source);
    List<UserDailyLoad> findByUserIdAndLoadDateBetween(Long userId, LocalDate from, LocalDate to);
    List<UserDailyLoad> findByUserIdAndLoadDateGreaterThanEqual(Long userId, LocalDate from);
}
