package com.sgen.repository;

import com.sgen.entity.GarminWorkoutPush;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface GarminWorkoutPushRepository extends JpaRepository<GarminWorkoutPush, Long> {
    Optional<GarminWorkoutPush> findByCalendarEventId(Long calendarEventId);
    // Local event ids can be reused after delete — several pushes may share an
    // intervals_event_id. Always consume the ordered list, never Optional.
    List<GarminWorkoutPush> findByIntervalsEventIdOrderByIdDesc(Integer intervalsEventId);
    List<GarminWorkoutPush> findByUserIdAndStatus(Long userId, String status);
    List<GarminWorkoutPush> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
