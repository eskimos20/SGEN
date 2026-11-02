package com.sgen.repository;

import com.sgen.entity.GarminActivityStreams;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GarminActivityStreamsRepository extends JpaRepository<GarminActivityStreams, Long> {
    void deleteByActivityId(Long activityId);
}
