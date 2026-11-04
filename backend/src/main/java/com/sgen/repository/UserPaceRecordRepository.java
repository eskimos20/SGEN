package com.sgen.repository;

import com.sgen.entity.UserPaceRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserPaceRecordRepository extends JpaRepository<UserPaceRecord, Long> {
    List<UserPaceRecord> findByUserId(Long userId);
    Optional<UserPaceRecord> findByUserIdAndDistanceM(Long userId, Integer distanceM);
    void deleteByUserId(Long userId);
    void deleteByUserIdAndActivityId(Long userId, String activityId);
}
