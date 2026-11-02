package com.sgen.repository;

import com.sgen.entity.GarminFileQueueItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface GarminFileQueueItemRepository extends JpaRepository<GarminFileQueueItem, Long> {
    List<GarminFileQueueItem> findTop20ByStatusOrderByCreatedAtAsc(String status);
    boolean existsBySummaryId(String summaryId);
}
