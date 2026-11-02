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

    private final com.sgen.repository.UserRepository userRepository;
    private final GarminActivityRepository activityRepository;
    private final GarminActivityStreamsRepository activityStreamsRepository;
    private final GarminActivityIntervalRepository activityIntervalRepository;
    private final GarminWellnessRepository wellnessRepository;
    private final GarminFileQueueItemRepository fileQueueRepository;
    private final GarminWorkoutPushRepository workoutPushRepository;
    private final UserDailyLoadRepository dailyLoadRepository;
    private final com.sgen.repository.UserFitnessRepository fitnessRepository;
    private final com.sgen.repository.IntervalsActivityRepository intervalsActivityRepository;
    private final com.sgen.repository.IntervalsActivityStreamsRepository intervalsStreamsRepository;
    private final com.sgen.repository.IntervalsEventRepository intervalsEventRepository;
    private final com.sgen.repository.IntervalsWellnessRepository intervalsWellnessRepository;

    @Transactional
    public void deleteAllGarminData(Long userId) {
        // Child rows keyed by garmin_activities.id must go first (FK).
        java.util.List<Long> activityIds = activityRepository.findIdsByUserId(userId);
        if (!activityIds.isEmpty()) {
            activityStreamsRepository.deleteAllById(activityIds);
            activityIntervalRepository.deleteByActivityIdIn(activityIds);
        }
        activityRepository.deleteByUserId(userId);
        wellnessRepository.deleteByUserId(userId);
        fileQueueRepository.deleteByUserId(userId);
        workoutPushRepository.deleteByUserId(userId);
        // Everything imported/derived via the Intervals backfill goes too —
        // otherwise the status endpoint resurrects the old import count.
        intervalsActivityRepository.deleteByUserId(userId);
        intervalsStreamsRepository.deleteByUserId(userId);
        intervalsEventRepository.deleteByUserId(userId);
        intervalsWellnessRepository.deleteByUserId(userId);
        dailyLoadRepository.deleteByUserId(userId);
        fitnessRepository.deleteByUserId(userId);
        log.info("Deleted all Garmin data for user {}", nameOf(userId));
    }

    private String nameOf(Long userId) {
        return userRepository.findById(userId).map(com.sgen.entity.User::getUsername).orElse(String.valueOf(userId));
    }
}
