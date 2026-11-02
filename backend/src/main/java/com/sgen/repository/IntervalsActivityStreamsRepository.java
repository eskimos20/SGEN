package com.sgen.repository;

import com.sgen.entity.IntervalsActivityStreams;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IntervalsActivityStreamsRepository extends JpaRepository<IntervalsActivityStreams, Long> {
    Optional<IntervalsActivityStreams> findByUserIdAndActivityId(Long userId, String activityId);
    void deleteByUserId(Long userId);
}
