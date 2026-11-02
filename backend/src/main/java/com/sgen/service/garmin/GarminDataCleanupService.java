package com.sgen.service.garmin;

import com.sgen.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Wipes all locally held Garmin data for a user. Required by Garmin's
 * developer agreement when a user deregisters (and by SGEN's
 * no-persistent-PII design).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminDataCleanupService {

    private final GarminActivityRepository activityRepository;
    private final GarminWellnessRepository wellnessRepository;
    private final UserDailyLoadRepository dailyLoadRepository;

    @Transactional
    public void deleteAllGarminData(Long userId) {
        activityRepository.deleteByUserId(userId);
        wellnessRepository.deleteByUserId(userId);
        dailyLoadRepository.findByUserIdAndLoadDateGreaterThanEqual(userId, java.time.LocalDate.of(2000, 1, 1))
                .stream().filter(l -> "GARMIN".equals(l.getSource()))
                .forEach(dailyLoadRepository::delete);
        log.info("Deleted all Garmin data for user {}", userId);
    }
}
