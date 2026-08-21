package com.sgen.repository;

import com.sgen.entity.AIUsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AIUsageLogRepository extends JpaRepository<AIUsageLog, Long> {

    @Query("SELECT a.username, SUM(a.totalTokens), SUM(a.estimatedCost), COUNT(a) " +
           "FROM AIUsageLog a GROUP BY a.username ORDER BY SUM(a.totalTokens) DESC")
    List<Object[]> getUsageSummaryByUser();

    @Query("SELECT a.username, SUM(a.totalTokens), SUM(a.estimatedCost), COUNT(a) " +
           "FROM AIUsageLog a WHERE a.createdAt >= :since GROUP BY a.username ORDER BY SUM(a.totalTokens) DESC")
    List<Object[]> getUsageSummaryByUserSince(@Param("since") LocalDateTime since);

    @Query("SELECT a.model, SUM(a.totalTokens), SUM(a.estimatedCost), COUNT(a) " +
           "FROM AIUsageLog a GROUP BY a.model ORDER BY SUM(a.totalTokens) DESC")
    List<Object[]> getUsageSummaryByModel();

    @Query("SELECT YEAR(a.createdAt), MONTH(a.createdAt), SUM(a.promptTokens), SUM(a.completionTokens), SUM(a.totalTokens), SUM(a.estimatedCost), COUNT(a) " +
           "FROM AIUsageLog a WHERE a.username = :username AND a.createdAt >= :since " +
           "GROUP BY YEAR(a.createdAt), MONTH(a.createdAt) " +
           "ORDER BY YEAR(a.createdAt) DESC, MONTH(a.createdAt) DESC")
    List<Object[]> getMonthlyUsageByUser(@Param("username") String username, @Param("since") LocalDateTime since);

    @Query("SELECT a.model, SUM(a.totalTokens), SUM(a.estimatedCost), COUNT(a) " +
           "FROM AIUsageLog a WHERE a.username = :username AND a.createdAt >= :since " +
           "GROUP BY a.model ORDER BY SUM(a.totalTokens) DESC")
    List<Object[]> getModelUsageByUser(@Param("username") String username, @Param("since") LocalDateTime since);

    @Query("SELECT COALESCE(SUM(a.totalTokens), 0), COALESCE(SUM(a.estimatedCost), 0), COUNT(a) FROM AIUsageLog a")
    Object[] getTotalUsageStats();

    void deleteByUsername(String username);
}
