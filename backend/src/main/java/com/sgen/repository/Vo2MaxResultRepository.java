package com.sgen.repository;

import com.sgen.entity.Vo2MaxResult;
import com.sgen.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface Vo2MaxResultRepository extends JpaRepository<Vo2MaxResult, Long> {
    List<Vo2MaxResult> findByUserOrderByRankAsc(User user);
    void deleteByUserAndActivityId(User user, String activityId);
    void deleteByUser(User user);
}
