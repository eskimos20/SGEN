package com.sgen.service;

import com.sgen.entity.FtpResult;
import com.sgen.entity.User;
import com.sgen.entity.Vo2MaxResult;
import com.sgen.repository.FtpResultRepository;
import com.sgen.repository.Vo2MaxResultRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class PerformanceService {

    private final FtpResultRepository ftpResultRepository;
    private final Vo2MaxResultRepository vo2MaxResultRepository;
    private final UserService userService;

    /**
     * Calculate and update FTP from pre-calculated best 5-min window
     */
    @Transactional
    public void updateFtpIfBetter(String username, String activityId, String activityName, 
                                   String activityType, LocalDate activityDate,
                                   double best5minAvg) {
        User user = userService.getUserEntityByUsername(username);
        
        if (best5minAvg <= 0) {
            return;
        }
        
        // Calculate FTP from the window
        FtpCalculationResult result = calculateFTPWithData(best5minAvg);
        if (result == null) {
            return;
        }
        
        double ftpValue = result.ftpValue;
        
        // Get current top 3
        List<FtpResult> currentTop3 = ftpResultRepository.findByUserOrderByRankAsc(user);
        
        // Skip if this activity already exists with the same FTP value (avoid redundant updates)
        boolean alreadyExists = currentTop3.stream()
                .anyMatch(r -> activityId.equals(r.getActivityId()) && Math.abs(r.getFtpValue() - ftpValue) < 0.01);
        if (alreadyExists) {
            return;
        }
        
        // Check if this result should be in top 3
        if (shouldAddToTop3(ftpValue, currentTop3)) {
            // Remove old entry for this activity if exists (from DB and in-memory list)
            ftpResultRepository.deleteByUserAndActivityId(user, activityId);
            currentTop3.removeIf(r -> activityId.equals(r.getActivityId()));
            
            // Add new result
            FtpResult newResult = FtpResult.builder()
                    .user(user)
                    .ftpValue(result.ftpValue)
                    .activityId(activityId)
                    .activityName(activityName)
                    .activityType(activityType)
                    .activityDate(activityDate)
                    .basisDurationSeconds(result.basisDuration)
                    .averageWatts(result.best5minAvg)
                    .rank(0)
                    .build();
            
            currentTop3.add(newResult);
            currentTop3.sort((a, b) -> Double.compare(b.getFtpValue(), a.getFtpValue()));
            
            // Keep only top 3
            while (currentTop3.size() > 3) {
                FtpResult toRemove = currentTop3.remove(3);
                if (toRemove.getId() != null) {
                    ftpResultRepository.delete(toRemove);
                }
            }
            
            // Update ranks and save
            for (int i = 0; i < currentTop3.size(); i++) {
                currentTop3.get(i).setRank(i + 1);
            }
            ftpResultRepository.saveAll(currentTop3);
        }
    }

    /**
     * Calculate and update VO2Max from pre-calculated best 5-min window
     */
    @Transactional
    public void updateVo2MaxIfBetter(String username, String activityId, String activityName, 
                                      String activityType, LocalDate activityDate, 
                                      double weightKg, double best5minAvg) {
        User user = userService.getUserEntityByUsername(username);
        
        // Calculate VO2Max from pre-calculated best 5-min window
        Vo2MaxData vo2Data = calculateVO2Max(activityType, weightKg, best5minAvg);
        
        if (vo2Data == null || vo2Data.value <= 0) {
            return;
        }
        
        // Get current top 3
        List<Vo2MaxResult> currentTop3 = vo2MaxResultRepository.findByUserOrderByRankAsc(user);
        
        // Skip if this activity already exists with the same VO2Max value (avoid redundant updates)
        boolean alreadyExists = currentTop3.stream()
                .anyMatch(r -> activityId.equals(r.getActivityId()) && Math.abs(r.getVo2MaxValue() - vo2Data.value) < 0.01);
        if (alreadyExists) {
            return;
        }
        
        // Check if this result should be in top 3
        if (shouldAddToTop3Vo2(vo2Data.value, currentTop3)) {
            // Remove old entry for this activity if exists (from DB and in-memory list)
            vo2MaxResultRepository.deleteByUserAndActivityId(user, activityId);
            currentTop3.removeIf(r -> activityId.equals(r.getActivityId()));
            
            // Add new result (round VO2Max to 1 decimal, watts to integer)
            double roundedVo2Max = Math.round(vo2Data.value * 10.0) / 10.0;
            double roundedWatts = Math.round(vo2Data.avgWatts);
            Vo2MaxResult newResult = Vo2MaxResult.builder()
                    .user(user)
                    .vo2MaxValue(roundedVo2Max)
                    .activityId(activityId)
                    .activityName(activityName)
                    .activityType(activityType)
                    .activityDate(activityDate)
                    .averageWatts(roundedWatts)
                    .durationSeconds(vo2Data.duration)
                    .weightKg(weightKg)
                    .rating(vo2Data.rating)
                    .rank(0)
                    .build();
            
            currentTop3.add(newResult);
            currentTop3.sort((a, b) -> Double.compare(b.getVo2MaxValue(), a.getVo2MaxValue()));
            
            // Keep only top 3
            while (currentTop3.size() > 3) {
                Vo2MaxResult toRemove = currentTop3.remove(3);
                if (toRemove.getId() != null) {
                    vo2MaxResultRepository.delete(toRemove);
                }
            }
            
            // Update ranks and save
            for (int i = 0; i < currentTop3.size(); i++) {
                currentTop3.get(i).setRank(i + 1);
            }
            vo2MaxResultRepository.saveAll(currentTop3);
        }
    }

    /**
     * Get top 3 FTP results for user
     */
    public List<FtpResult> getTop3Ftp(String username) {
        User user = userService.getUserEntityByUsername(username);
        return ftpResultRepository.findByUserOrderByRankAsc(user);
    }

    /**
     * Get top 3 VO2Max results for user
     */
    public List<Vo2MaxResult> getTop3Vo2Max(String username) {
        User user = userService.getUserEntityByUsername(username);
        return vo2MaxResultRepository.findByUserOrderByRankAsc(user);
    }

    // Helper methods for FTP calculation
    private FtpCalculationResult calculateFTPWithData(double best5minAvg) {
        if (best5minAvg <= 0) {
            return null;
        }
        
        return new FtpCalculationResult(best5minAvg * 0.80, best5minAvg, 300);
    }
    
    private boolean shouldAddToTop3(double value, List<FtpResult> currentTop3) {
        if (currentTop3.size() < 3) return true;
        return value > currentTop3.get(2).getFtpValue();
    }

    // Helper methods for VO2Max calculation
    private Vo2MaxData calculateVO2Max(String activityType, double weightKg, double best5minAvg) {
        if (weightKg <= 0 || best5minAvg <= 0) return null;
        
        // Calculate VO2Max from the best 5-min power window
        double vo2 = calculateVO2MaxFromWatts(best5minAvg, weightKg, activityType);
        return new Vo2MaxData(vo2, best5minAvg, 300, getRating(vo2));
    }
    
    private double calculateVO2MaxFromWatts(double watts, double weightKg, String activityType) {
        String type = activityType.toLowerCase();
        
        if (type.contains("ride")) {
            // Cycling: VO2max = 10.8 * (W/kg) + 7
            return 10.8 * (watts / weightKg) + 7;
        } else if (type.contains("run")) {
            // Running: VO2max = 12.5 * (W/kg) + 3.5
            return 12.5 * (watts / weightKg) + 3.5;
        } else if (type.equalsIgnoreCase("skierg") || type.equalsIgnoreCase("rowing") || type.equalsIgnoreCase("watersport")) {
            // SkiErg/Rowing: VO2max = 0.178 * W + 9.6
            return 0.178 * watts + 9.6;
        }
        return 0;
    }
    
    private String getRating(double vo2Max) {
        if (vo2Max >= 60) return "Excellent";
        if (vo2Max >= 50) return "Very Good";
        if (vo2Max >= 40) return "Good";
        if (vo2Max >= 30) return "Fair";
        return "Poor";
    }
    
    private boolean shouldAddToTop3Vo2(double value, List<Vo2MaxResult> currentTop3) {
        if (currentTop3.size() < 3) return true;
        return value > currentTop3.get(2).getVo2MaxValue();
    }

    // Helper class for FTP calculation result
    private static class FtpCalculationResult {
        double ftpValue;
        double best5minAvg;
        int basisDuration;

        FtpCalculationResult(double ftpValue, double best5minAvg, int basisDuration) {
            this.ftpValue = ftpValue;
            this.best5minAvg = best5minAvg;
            this.basisDuration = basisDuration;
        }
    }

    // Helper class for VO2Max data
    private static class Vo2MaxData {
        double value;
        double avgWatts;
        int duration;
        String rating;

        Vo2MaxData(double value, double avgWatts, int duration, String rating) {
            this.value = value;
            this.avgWatts = avgWatts;
            this.duration = duration;
            this.rating = rating;
        }
    }
}
