package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.entity.User;
import com.sgen.entity.UserAchievement;
import com.sgen.repository.UserAchievementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class AchievementNotificationService {
    
    private final UserAchievementRepository achievementRepository;
    private final IntervalsEventService eventService;
    private final IntervalsAthleteService athleteService;
    private final UserService userService;
    
    /**
     * Fetch pending FTP/LTHR achievements for user
     * Scans last 90 days of activities for FTP_UP and LTHR_UP achievements
     */
    @Transactional
    public Map<String, Object> getPendingAchievements(String username) {
        User user = userService.getUserEntityByUsername(username);
        
        try {
            // Fetch last 90 days of activities from Intervals.icu
            LocalDate oldestDate = LocalDate.now().minusDays(90);
            LocalDate newestDate = LocalDate.now();
            String oldest = oldestDate.toString();
            String newest = newestDate.toString();
            
            JsonNode activities = eventService.fetchCalendarActivities(username, oldest, newest);
            
            if (activities == null || !activities.isArray()) {
                return Map.of("pending", Collections.emptyList());
            }
            
            // Fetch current sport settings once to compare against the user's ACTUAL current FTP/LTHR
            JsonNode sportSettings = athleteService.getSportSettings(username);
            
            // Process activities and extract FTP_UP / LTHR_UP achievements
            List<Map<String, Object>> pendingAchievements = new ArrayList<>();
            
            for (JsonNode activity : activities) {
                JsonNode achievements = activity.get("icu_achievements");
                if (achievements == null || !achievements.isArray()) {
                    continue;
                }
                
                String activityId = activity.get("id").asText();
                String activityName = activity.get("name").asText();
                String sportType = activity.get("type").asText();
                String dateStr = activity.get("start_date_local").asText();
                LocalDate activityDate = LocalDate.parse(dateStr.substring(0, 10));
                
                for (JsonNode achievement : achievements) {
                    String type = achievement.get("type").asText();
                    
                    // Only process FTP_UP and LTHR_UP
                    if (!type.equals("FTP_UP") && !type.equals("LTHR_UP")) {
                        continue;
                    }
                    
                    // Check if already exists in DB
                    Optional<UserAchievement> existingOpt = achievementRepository
                            .findByUserAndActivityIdAndAchievementType(user, activityId, type);
                    
                    Map<String, Object> map;
                    if (existingOpt.isPresent()) {
                        UserAchievement existing = existingOpt.get();
                        // If already accepted or dismissed, skip it
                        if (existing.getStatus() != UserAchievement.AchievementStatus.PENDING) {
                            continue;
                        }
                        // If still pending, prepare it for the list
                        map = achievementToMap(existing);
                    } else {
                        // Create new pending achievement
                        UserAchievement userAchievement = createAchievementFromJson(
                                user, activity, achievement, activityId, activityName, 
                                sportType, activityDate, type
                        );
                        
                        achievementRepository.save(userAchievement);
                        
                        map = achievementToMap(userAchievement);
                    }
                    
                    // Use current FTP/LTHR as baseline; skip if not an improvement over current
                    if (applyCurrentBaseline(map, sportSettings)) {
                        pendingAchievements.add(map);
                    }
                }
            }
            
            // Also get existing pending achievements from DB (only from last 90 days)
            List<UserAchievement> existingPending = achievementRepository
                    .findByUserAndStatusOrderByAchievementDateDesc(
                            user, UserAchievement.AchievementStatus.PENDING
                    );
            
            LocalDate ninetyDaysAgo = LocalDate.now().minusDays(90);
            for (UserAchievement existing : existingPending) {
                // Only include achievements from last 90 days
                if (existing.getAchievementDate().isBefore(ninetyDaysAgo)) {
                    continue;
                }
                
                // Avoid duplicates
                boolean alreadyAdded = pendingAchievements.stream()
                        .anyMatch(a -> a.get("id").equals(existing.getId()));
                if (!alreadyAdded) {
                    Map<String, Object> map = achievementToMap(existing);
                    if (applyCurrentBaseline(map, sportSettings)) {
                        pendingAchievements.add(map);
                    }
                }
            }
            
            // Sort by date descending
            pendingAchievements.sort((a, b) -> 
                    ((LocalDate) b.get("achievementDate")).compareTo((LocalDate) a.get("achievementDate"))
            );
            
            // Return all pending achievements
            return Map.of("pending", pendingAchievements);
            
        } catch (Exception e) {
            log.error("Failed to fetch pending achievements for {}: {}", username, e.getMessage(), e);
            return Map.of("pending", Collections.emptyList(), "error", e.getMessage());
        }
    }
    
    private UserAchievement createAchievementFromJson(
            User user, JsonNode activity, JsonNode achievement, 
            String activityId, String activityName, String sportType, 
            LocalDate activityDate, String type) {
        
        UserAchievement.UserAchievementBuilder builder = UserAchievement.builder()
                .user(user)
                .achievementId(achievement.get("id").asText())
                .activityId(activityId)
                .activityName(activityName)
                .sportType(sportType)
                .achievementDate(activityDate)
                .achievementType(type)
                .status(UserAchievement.AchievementStatus.PENDING);
        
        if (type.equals("FTP_UP")) {
            builder.newFtpValue(activity.has("icu_rolling_ftp") ? 
                    activity.get("icu_rolling_ftp").asInt() : null);
            builder.oldFtpValue(activity.has("icu_ftp") ? 
                    activity.get("icu_ftp").asInt() : null);
            builder.effortWatts(achievement.has("watts") ? 
                    achievement.get("watts").asInt() : null);
            builder.effortSeconds(achievement.has("secs") ? 
                    achievement.get("secs").asInt() : null);
        } else if (type.equals("LTHR_UP")) {
            builder.newLthrValue(achievement.has("value") ? 
                    achievement.get("value").asInt() : null);
            // Old LTHR would need to be fetched from athlete profile or previous activities
        }
        
        return builder.build();
    }
    
    private Map<String, Object> achievementToMap(UserAchievement achievement) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", achievement.getId());
        map.put("achievementType", achievement.getAchievementType());
        map.put("activityId", achievement.getActivityId());
        map.put("activityName", achievement.getActivityName());
        map.put("sportType", achievement.getSportType());
        map.put("achievementDate", achievement.getAchievementDate());
        map.put("newFtpValue", achievement.getNewFtpValue());
        map.put("oldFtpValue", achievement.getOldFtpValue());
        map.put("effortWatts", achievement.getEffortWatts());
        map.put("effortSeconds", achievement.getEffortSeconds());
        map.put("newLthrValue", achievement.getNewLthrValue());
        map.put("oldLthrValue", achievement.getOldLthrValue());
        map.put("status", achievement.getStatus().toString());
        map.put("respondedAt", achievement.getRespondedAt());
        return map;
    }
    
    /**
     * Replace the achievement's "old" value with the user's ACTUAL current FTP/LTHR
     * from sport settings, so the comparison reflects reality rather than the
     * historic per-activity value reported by Intervals.icu.
     *
     * The achievement is always presented (including decreases), so the user can
     * see the correct delta against their current value (e.g. 291 -> 284 = -7).
     *
     * @return always true (kept for call-site readability/extensibility).
     */
    private boolean applyCurrentBaseline(Map<String, Object> map, JsonNode sportSettings) {
        String type = (String) map.get("achievementType");
        String sportType = (String) map.get("sportType");
        
        if ("FTP_UP".equals(type)) {
            Integer currentFtp = athleteService.getFtpForSport(sportSettings, sportType);
            if (currentFtp != null) {
                map.put("oldFtpValue", currentFtp);
            }
        } else if ("LTHR_UP".equals(type)) {
            Integer currentLthr = athleteService.getLthrForSport(sportSettings, sportType);
            if (currentLthr != null) {
                map.put("oldLthrValue", currentLthr);
            }
        }
        return true;
    }
    
    /**
     * Accept achievement and update user's FTP/LTHR
     */
    @Transactional
    public void acceptAchievement(String username, Long achievementId) {
        User user = userService.getUserEntityByUsername(username);
        UserAchievement achievement = achievementRepository.findById(achievementId)
                .orElseThrow(() -> new RuntimeException("Achievement not found"));
        
        if (!achievement.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("Achievement does not belong to user");
        }
        
        // Update status
        achievement.setStatus(UserAchievement.AchievementStatus.ACCEPTED);
        achievement.setRespondedAt(LocalDateTime.now());
        achievementRepository.save(achievement);
        
        // Update FTP/LTHR in user's sport settings
        if (achievement.getAchievementType().equals("FTP_UP") && achievement.getNewFtpValue() != null) {
            athleteService.updateSportSettingsFtp(username, achievement.getSportType(),
                    achievement.getNewFtpValue());
        } else if (achievement.getAchievementType().equals("LTHR_UP") && achievement.getNewLthrValue() != null) {
            athleteService.updateSportSettingsLthr(username, achievement.getSportType(),
                    achievement.getNewLthrValue());
        }
        
        log.info("Accepted achievement {} for user {}", achievementId, username);
    }
    
    /**
     * Dismiss achievement without updating FTP/LTHR
     */
    @Transactional
    public void dismissAchievement(String username, Long achievementId) {
        User user = userService.getUserEntityByUsername(username);
        UserAchievement achievement = achievementRepository.findById(achievementId)
                .orElseThrow(() -> new RuntimeException("Achievement not found"));
        
        if (!achievement.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("Achievement does not belong to user");
        }
        
        achievement.setStatus(UserAchievement.AchievementStatus.DISMISSED);
        achievement.setRespondedAt(LocalDateTime.now());
        achievementRepository.save(achievement);
        
        log.info("Dismissed achievement {} for user {}", achievementId, username);
    }
    
    /**
     * Accept achievement identified by activityId + achievementType (for Achievements page).
     * Finds or creates the DB record, then applies the same logic as acceptAchievement.
     */
    @Transactional
    public void acceptAchievementByActivity(String username, String activityId, String achievementType,
                                            Integer newFtpValue, Integer oldFtpValue,
                                            Integer effortWatts, Integer effortSeconds,
                                            Integer newLthrValue, Integer oldLthrValue,
                                            String activityName, String sportType, LocalDate achievementDate) {
        User user = userService.getUserEntityByUsername(username);

        UserAchievement achievement = achievementRepository
                .findByUserAndActivityIdAndAchievementType(user, activityId, achievementType)
                .orElseGet(() -> {
                    UserAchievement.UserAchievementBuilder b = UserAchievement.builder()
                            .user(user)
                            .achievementId(achievementType.toLowerCase())
                            .activityId(activityId)
                            .activityName(activityName != null ? activityName : activityId)
                            .sportType(sportType != null ? sportType : "Ride")
                            .achievementDate(achievementDate != null ? achievementDate : LocalDate.now())
                            .achievementType(achievementType)
                            .newFtpValue(newFtpValue)
                            .oldFtpValue(oldFtpValue)
                            .effortWatts(effortWatts)
                            .effortSeconds(effortSeconds)
                            .newLthrValue(newLthrValue)
                            .oldLthrValue(oldLthrValue)
                            .status(UserAchievement.AchievementStatus.PENDING);
                    return achievementRepository.save(b.build());
                });

        if (achievement.getStatus() != UserAchievement.AchievementStatus.PENDING) {
            achievement.setStatus(UserAchievement.AchievementStatus.PENDING);
        }
        achievement.setStatus(UserAchievement.AchievementStatus.ACCEPTED);
        achievement.setRespondedAt(LocalDateTime.now());
        achievementRepository.save(achievement);

        if (achievementType.equals("FTP_UP") && achievement.getNewFtpValue() != null) {
            athleteService.updateSportSettingsFtp(username, achievement.getSportType(),
                    achievement.getNewFtpValue());
        } else if (achievementType.equals("LTHR_UP") && achievement.getNewLthrValue() != null) {
            athleteService.updateSportSettingsLthr(username, achievement.getSportType(),
                    achievement.getNewLthrValue());
        }

        log.info("Accepted achievement by activity {}/{} for user {}", activityId, achievementType, username);
    }

    /**
     * Dismiss achievement identified by activityId + achievementType (for Achievements page).
     */
    @Transactional
    public void dismissAchievementByActivity(String username, String activityId, String achievementType,
                                             Integer newFtpValue, Integer oldFtpValue,
                                             Integer effortWatts, Integer effortSeconds,
                                             Integer newLthrValue, Integer oldLthrValue,
                                             String activityName, String sportType, LocalDate achievementDate) {
        User user = userService.getUserEntityByUsername(username);

        UserAchievement achievement = achievementRepository
                .findByUserAndActivityIdAndAchievementType(user, activityId, achievementType)
                .orElseGet(() -> {
                    UserAchievement.UserAchievementBuilder b = UserAchievement.builder()
                            .user(user)
                            .achievementId(achievementType.toLowerCase())
                            .activityId(activityId)
                            .activityName(activityName != null ? activityName : activityId)
                            .sportType(sportType != null ? sportType : "Ride")
                            .achievementDate(achievementDate != null ? achievementDate : LocalDate.now())
                            .achievementType(achievementType)
                            .newFtpValue(newFtpValue)
                            .oldFtpValue(oldFtpValue)
                            .effortWatts(effortWatts)
                            .effortSeconds(effortSeconds)
                            .newLthrValue(newLthrValue)
                            .oldLthrValue(oldLthrValue)
                            .status(UserAchievement.AchievementStatus.PENDING);
                    return achievementRepository.save(b.build());
                });

        achievement.setStatus(UserAchievement.AchievementStatus.DISMISSED);
        achievement.setRespondedAt(LocalDateTime.now());
        achievementRepository.save(achievement);

        log.info("Dismissed achievement by activity {}/{} for user {}", activityId, achievementType, username);
    }

    /**
     * Get ALL achievements for user within a date range (for Achievements page)
     * Only fetches from Intervals.icu, does NOT save to database
     */
    public Map<String, Object> getAllAchievementsByDateRange(String username, LocalDate startDate, LocalDate endDate) {
        try {
            // Fetch activities from Intervals.icu for the date range
            String oldest = startDate.toString();
            String newest = endDate.toString();
            
            JsonNode activities = eventService.fetchCalendarActivities(username, oldest, newest);
            
            if (activities == null || !activities.isArray()) {
                return Map.of("achievements", Collections.emptyList());
            }
            
            // Fetch current sport settings once to use the user's ACTUAL current FTP/LTHR as baseline
            JsonNode sportSettings = athleteService.getSportSettings(username);
            
            // Process activities and extract ALL achievements
            List<Map<String, Object>> allAchievements = new ArrayList<>();
            
            for (JsonNode activity : activities) {
                JsonNode achievements = activity.get("icu_achievements");
                if (achievements == null || !achievements.isArray()) {
                    continue;
                }
                
                String activityId = activity.get("id").asText();
                String activityName = activity.get("name").asText();
                String sportType = activity.get("type").asText();
                String dateStr = activity.get("start_date_local").asText();
                LocalDate activityDate = LocalDate.parse(dateStr.substring(0, 10));
                
                for (JsonNode achievement : achievements) {
                    String type = achievement.get("type").asText();
                    String message = achievement.has("message") ? achievement.get("message").asText() : type;
                    
                    // Create achievement map for ALL types
                    Map<String, Object> achievementMap = new HashMap<>();
                    achievementMap.put("activityId", activityId);
                    achievementMap.put("activityName", activityName);
                    achievementMap.put("sportType", sportType);
                    achievementMap.put("achievementDate", activityDate.toString());
                    achievementMap.put("achievementType", type);
                    achievementMap.put("message", message);
                    
                    // Extract type-specific values
                    if (type.equals("FTP_UP")) {
                        Integer newFtp = activity.has("icu_rolling_ftp") ? activity.get("icu_rolling_ftp").asInt() : null;
                        Integer ftpDelta = activity.has("icu_rolling_ftp_delta") ? activity.get("icu_rolling_ftp_delta").asInt() : null;
                        // Use the user's current FTP as baseline; fall back to historic delta if unavailable
                        Integer currentFtp = athleteService.getFtpForSport(sportSettings, sportType);
                        Integer oldFtp = currentFtp != null ? currentFtp
                                : ((newFtp != null && ftpDelta != null) ? newFtp - ftpDelta : null);
                        
                        achievementMap.put("newFtpValue", newFtp);
                        achievementMap.put("oldFtpValue", oldFtp);
                        achievementMap.put("effortWatts", achievement.has("watts") ? achievement.get("watts").asInt() : null);
                        achievementMap.put("effortSeconds", achievement.has("secs") ? achievement.get("secs").asInt() : null);
                    } else if (type.equals("LTHR_UP")) {
                        Integer newLthr = activity.has("icu_rolling_lthr") ? activity.get("icu_rolling_lthr").asInt() : null;
                        if (newLthr == null && achievement.has("value")) {
                            newLthr = achievement.get("value").asInt();
                        }
                        // Use the user's current LTHR as baseline
                        Integer currentLthr = athleteService.getLthrForSport(sportSettings, sportType);
                        achievementMap.put("newLthrValue", newLthr);
                        achievementMap.put("oldLthrValue", currentLthr);
                    } else if (type.equals("BEST_POWER") || type.equals("BEST_PACE")) {
                        achievementMap.put("watts", achievement.has("watts") ? achievement.get("watts").asInt() : null);
                        achievementMap.put("secs", achievement.has("secs") ? achievement.get("secs").asInt() : null);
                        achievementMap.put("distance", achievement.has("distance") ? achievement.get("distance").asDouble() : null);
                        achievementMap.put("pace", achievement.has("pace") ? achievement.get("pace").asDouble() : null);
                    }
                    
                    allAchievements.add(achievementMap);
                }
            }
            
            // Sort by date descending
            allAchievements.sort((a, b) ->
                    ((String) b.get("achievementDate")).compareTo((String) a.get("achievementDate"))
            );
            
            return Map.of("achievements", allAchievements);
            
        } catch (Exception e) {
            log.error("Failed to fetch all achievements by date range for {}: {}", username, e.getMessage(), e);
            return Map.of("achievements", Collections.emptyList(), "error", e.getMessage());
        }
    }
    
}
