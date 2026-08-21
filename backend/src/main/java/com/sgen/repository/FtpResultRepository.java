package com.sgen.repository;

import com.sgen.entity.FtpResult;
import com.sgen.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FtpResultRepository extends JpaRepository<FtpResult, Long> {
    List<FtpResult> findByUserOrderByRankAsc(User user);
    void deleteByUserAndActivityId(User user, String activityId);
    void deleteByUser(User user);
}
