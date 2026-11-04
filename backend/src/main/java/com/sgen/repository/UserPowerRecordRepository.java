package com.sgen.repository;

import com.sgen.entity.UserPowerRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserPowerRecordRepository extends JpaRepository<UserPowerRecord, Long> {
    List<UserPowerRecord> findByUserId(Long userId);
    Optional<UserPowerRecord> findByUserIdAndDurationS(Long userId, Integer durationS);
    void deleteByUserId(Long userId);
    void deleteByUserIdAndActivityId(Long userId, String activityId);
}
