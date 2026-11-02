package com.sgen.repository;

import com.sgen.entity.IntervalsEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface IntervalsEventRepository extends JpaRepository<IntervalsEvent, Long> {
    Optional<IntervalsEvent> findByUserIdAndEventId(Long userId, String eventId);
    List<IntervalsEvent> findByUserIdAndStartDateLocalBetweenOrderByStartDateLocalAsc(
            Long userId, LocalDateTime from, LocalDateTime to);
    void deleteByUserId(Long userId);
    long countByUserId(Long userId);
}
