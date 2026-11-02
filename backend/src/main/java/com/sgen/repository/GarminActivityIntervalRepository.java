package com.sgen.repository;

import com.sgen.entity.GarminActivityInterval;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface GarminActivityIntervalRepository extends JpaRepository<GarminActivityInterval, Long> {
    List<GarminActivityInterval> findByActivityIdOrderByStepOrderAsc(Long activityId);
    void deleteByActivityId(Long activityId);
    void deleteByActivityIdIn(java.util.Collection<Long> activityIds);
}
