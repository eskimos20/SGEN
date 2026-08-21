package com.sgen.repository;

import com.sgen.entity.BikeFitAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BikeFitAnalysisRepository extends JpaRepository<BikeFitAnalysis, Long> {
    List<BikeFitAnalysis> findByUserIdOrderByCreatedAtDesc(Long userId);
    void deleteByUserId(Long userId);
}
