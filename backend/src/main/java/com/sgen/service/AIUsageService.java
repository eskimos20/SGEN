package com.sgen.service;

import com.sgen.entity.AIUsageLog;
import com.sgen.repository.AIUsageLogRepository;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
@ConfigurationProperties(prefix = "openai")
public class AIUsageService {

    private final AIUsageLogRepository usageLogRepository;
    
    // Pricing loaded from application.yml
    private Map<String, Map<String, Double>> pricing = new ConcurrentHashMap<>();
    
    // Default pricing fallback (per 1M tokens)
    private static final double DEFAULT_INPUT_PRICE = 2.50;
    private static final double DEFAULT_OUTPUT_PRICE = 10.00;
    
    public AIUsageService(AIUsageLogRepository usageLogRepository) {
        this.usageLogRepository = usageLogRepository;
    }
    
    // Setter for Spring to inject pricing from application.yml
    public void setPricing(Map<String, Map<String, Double>> pricing) {
        this.pricing = pricing;
    }
    
    @PostConstruct
    public void init() {
        if (pricing != null && !pricing.isEmpty()) {
            log.info("Loaded pricing for {} OpenAI models from configuration: {}", pricing.size(), pricing.keySet());
        } else {
            log.warn("No OpenAI pricing configured, using default prices (input: ${}, output: ${})", 
                     DEFAULT_INPUT_PRICE, DEFAULT_OUTPUT_PRICE);
        }
    }

    @Transactional
    public void logUsage(String username, String model, int promptTokens, int completionTokens, String requestType) {
        int totalTokens = promptTokens + completionTokens;
        BigDecimal cost = calculateCost(model, promptTokens, completionTokens);

        AIUsageLog usageLog = AIUsageLog.builder()
                .username(username)
                .model(model)
                .promptTokens(promptTokens)
                .completionTokens(completionTokens)
                .totalTokens(totalTokens)
                .estimatedCost(cost)
                .requestType(requestType)
                .build();

        usageLogRepository.save(usageLog);
        log.info("AI usage logged - User: {}, Model: {}, Tokens: {} (prompt: {}, completion: {}), Cost: ${}", 
                 username, model, totalTokens, promptTokens, completionTokens, cost);
    }

    private BigDecimal calculateCost(String model, int promptTokens, int completionTokens) {
        double inputPrice = DEFAULT_INPUT_PRICE;
        double outputPrice = DEFAULT_OUTPUT_PRICE;
        
        // Find matching pricing from configuration (check for partial matches)
        if (pricing != null && !pricing.isEmpty()) {
            for (Map.Entry<String, Map<String, Double>> entry : pricing.entrySet()) {
                String modelKey = entry.getKey();
                if (model.contains(modelKey) || model.startsWith(modelKey)) {
                    Map<String, Double> prices = entry.getValue();
                    if (prices.get("input") != null) {
                        inputPrice = prices.get("input");
                    }
                    if (prices.get("output") != null) {
                        outputPrice = prices.get("output");
                    }
                    break;
                }
            }
        }

        // Calculate cost: (tokens / 1,000,000) * price_per_million
        double inputCost = (promptTokens / 1_000_000.0) * inputPrice;
        double outputCost = (completionTokens / 1_000_000.0) * outputPrice;

        return BigDecimal.valueOf(inputCost + outputCost).setScale(6, RoundingMode.HALF_UP);
    }

    public Map<String, Object> getUsageSummary() {
        Map<String, Object> summary = new LinkedHashMap<>();

        // Total usage - use database aggregation instead of loading all logs
        Object[] totalStats = usageLogRepository.getTotalUsageStats();
        long totalTokens = ((Number) totalStats[0]).longValue();
        BigDecimal totalCost = (BigDecimal) totalStats[1];
        long totalRequests = ((Number) totalStats[2]).longValue();

        summary.put("totalRequests", totalRequests);
        summary.put("totalTokens", totalTokens);
        summary.put("totalCost", totalCost);

        // Usage by user
        List<Object[]> userSummary = usageLogRepository.getUsageSummaryByUser();
        List<Map<String, Object>> byUser = new ArrayList<>();
        for (Object[] row : userSummary) {
            Map<String, Object> userStats = new LinkedHashMap<>();
            userStats.put("username", row[0]);
            userStats.put("totalTokens", row[1]);
            userStats.put("totalCost", row[2]);
            userStats.put("requestCount", row[3]);
            byUser.add(userStats);
        }
        summary.put("byUser", byUser);

        // Usage by model
        List<Object[]> modelSummary = usageLogRepository.getUsageSummaryByModel();
        List<Map<String, Object>> byModel = new ArrayList<>();
        for (Object[] row : modelSummary) {
            Map<String, Object> modelStats = new LinkedHashMap<>();
            modelStats.put("model", row[0]);
            modelStats.put("totalTokens", row[1]);
            modelStats.put("totalCost", row[2]);
            modelStats.put("requestCount", row[3]);
            byModel.add(modelStats);
        }
        summary.put("byModel", byModel);

        // Last 30 days
        LocalDateTime thirtyDaysAgo = LocalDateTime.now().minusDays(30);
        List<Object[]> last30Days = usageLogRepository.getUsageSummaryByUserSince(thirtyDaysAgo);
        List<Map<String, Object>> last30DaysByUser = new ArrayList<>();
        for (Object[] row : last30Days) {
            Map<String, Object> userStats = new LinkedHashMap<>();
            userStats.put("username", row[0]);
            userStats.put("totalTokens", row[1]);
            userStats.put("totalCost", row[2]);
            userStats.put("requestCount", row[3]);
            last30DaysByUser.add(userStats);
        }
        summary.put("last30DaysByUser", last30DaysByUser);

        return summary;
    }

    /**
     * Get user's AI usage statistics with monthly breakdown and currency conversion.
     * Returns current month + 3 months history.
     */
    public Map<String, Object> getUserMonthlyUsage(String username, double usdToSekRate) {
        Map<String, Object> result = new LinkedHashMap<>();
        
        // Get data for last 4 months (current + 3 history)
        LocalDateTime fourMonthsAgo = LocalDateTime.now().withDayOfMonth(1).minusMonths(3);
        
        // Monthly breakdown
        List<Object[]> monthlyData = usageLogRepository.getMonthlyUsageByUser(username, fourMonthsAgo);
        List<Map<String, Object>> months = new ArrayList<>();
        
        for (Object[] row : monthlyData) {
            Map<String, Object> month = new LinkedHashMap<>();
            int year = ((Number) row[0]).intValue();
            int monthNum = ((Number) row[1]).intValue();
            month.put("year", year);
            month.put("month", monthNum);
            month.put("monthName", getMonthName(monthNum));
            month.put("promptTokens", row[2]);
            month.put("completionTokens", row[3]);
            month.put("totalTokens", row[4]);
            
            BigDecimal costUsd = row[5] != null ? (BigDecimal) row[5] : BigDecimal.ZERO;
            month.put("costUsd", costUsd);
            month.put("costSek", costUsd.multiply(BigDecimal.valueOf(usdToSekRate)).setScale(2, RoundingMode.HALF_UP));
            month.put("requestCount", row[6]);
            months.add(month);
        }
        result.put("monthlyUsage", months);
        
        // Model breakdown for the period
        List<Object[]> modelData = usageLogRepository.getModelUsageByUser(username, fourMonthsAgo);
        List<Map<String, Object>> models = new ArrayList<>();
        for (Object[] row : modelData) {
            Map<String, Object> model = new LinkedHashMap<>();
            model.put("model", row[0]);
            model.put("totalTokens", row[1]);
            BigDecimal costUsd = row[2] != null ? (BigDecimal) row[2] : BigDecimal.ZERO;
            model.put("costUsd", costUsd);
            model.put("costSek", costUsd.multiply(BigDecimal.valueOf(usdToSekRate)).setScale(2, RoundingMode.HALF_UP));
            model.put("requestCount", row[3]);
            models.add(model);
        }
        result.put("modelUsage", models);
        
        // Calculate totals
        long totalTokens = months.stream()
                .mapToLong(m -> ((Number) m.get("totalTokens")).longValue())
                .sum();
        BigDecimal totalCostUsd = months.stream()
                .map(m -> (BigDecimal) m.get("costUsd"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalRequests = months.stream()
                .mapToInt(m -> ((Number) m.get("requestCount")).intValue())
                .sum();
        
        result.put("totalTokens", totalTokens);
        result.put("totalCostUsd", totalCostUsd);
        result.put("totalCostSek", totalCostUsd.multiply(BigDecimal.valueOf(usdToSekRate)).setScale(2, RoundingMode.HALF_UP));
        result.put("totalRequests", totalRequests);
        result.put("usdToSekRate", usdToSekRate);
        
        return result;
    }
    
    private String getMonthName(int month) {
        String[] months = {"", "January", "February", "March", "April", "May", "June", 
                          "July", "August", "September", "October", "November", "December"};
        return month >= 1 && month <= 12 ? months[month] : "";
    }
    
    /**
     * Get AI usage statistics for all users with monthly breakdown.
     * Returns current month + 3 months history per user.
     */
    public Map<String, Object> getAllUsersMonthlyUsage(double usdToSekRate) {
        Map<String, Object> result = new LinkedHashMap<>();
        
        // Get all unique usernames that have AI usage
        List<Object[]> userSummary = usageLogRepository.getUsageSummaryByUser();
        List<String> usernames = userSummary.stream()
                .map(row -> (String) row[0])
                .toList();
        
        // Get monthly usage for each user
        List<Map<String, Object>> usersData = new ArrayList<>();
        for (String username : usernames) {
            Map<String, Object> userData = getUserMonthlyUsage(username, usdToSekRate);
            userData.put("username", username);
            usersData.add(userData);
        }
        
        result.put("users", usersData);
        result.put("usdToSekRate", usdToSekRate);
        
        // Calculate grand totals
        long grandTotalTokens = usersData.stream()
                .mapToLong(u -> ((Number) u.get("totalTokens")).longValue())
                .sum();
        BigDecimal grandTotalCostUsd = usersData.stream()
                .map(u -> (BigDecimal) u.get("totalCostUsd"))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int grandTotalRequests = usersData.stream()
                .mapToInt(u -> ((Number) u.get("totalRequests")).intValue())
                .sum();
        
        result.put("grandTotalTokens", grandTotalTokens);
        result.put("grandTotalCostUsd", grandTotalCostUsd);
        result.put("grandTotalCostSek", grandTotalCostUsd.multiply(BigDecimal.valueOf(usdToSekRate)).setScale(2, RoundingMode.HALF_UP));
        result.put("grandTotalRequests", grandTotalRequests);
        
        return result;
    }
}
