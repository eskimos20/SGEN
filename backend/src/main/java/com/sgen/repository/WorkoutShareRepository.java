package com.sgen.repository;

import com.sgen.entity.WorkoutShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkoutShareRepository extends JpaRepository<WorkoutShare, Long> {

    List<WorkoutShare> findByToUsernameAndStatus(String toUsername, WorkoutShare.Status status);

    List<WorkoutShare> findByFromUsername(String fromUsername);

    List<WorkoutShare> findByFromUsernameAndSourcePathAndStatus(String fromUsername, String sourcePath, WorkoutShare.Status status);
}
