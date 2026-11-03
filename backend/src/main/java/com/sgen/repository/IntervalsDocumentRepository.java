package com.sgen.repository;

import com.sgen.entity.IntervalsDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface IntervalsDocumentRepository extends JpaRepository<IntervalsDocument, Long> {
    Optional<IntervalsDocument> findByUserIdAndDocKey(Long userId, String docKey);
    void deleteByUserId(Long userId);
}
