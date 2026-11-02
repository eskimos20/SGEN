package com.sgen.repository;

import com.sgen.entity.GarminPushItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface GarminPushItemRepository extends JpaRepository<GarminPushItem, Long> {
    List<GarminPushItem> findTop50ByStatusOrderByReceivedAtAsc(String status);
    boolean existsBySummaryTypeAndSummaryId(String summaryType, String summaryId);
}
