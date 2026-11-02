package com.sgen.repository;

import com.sgen.entity.GarminWorkoutPush;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface GarminWorkoutPushRepository extends JpaRepository<GarminWorkoutPush, Long> {
    Optional<GarminWorkoutPush> findByCalendarEventId(Long calendarEventId);
    List<GarminWorkoutPush> findByUserIdAndStatus(Long userId, String status);
}
