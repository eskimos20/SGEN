package com.sgen.repository;

import com.sgen.entity.IntervalsAthleteMirror;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IntervalsAthleteMirrorRepository extends JpaRepository<IntervalsAthleteMirror, Long> {
    Optional<IntervalsAthleteMirror> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
