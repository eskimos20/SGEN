package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.sgen.entity.LocalSportSettings;
import com.sgen.repository.LocalSportSettingsRepository;
import com.sgen.repository.UserRepository;
import com.sgen.service.IntervalsAthleteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Resolves FTP/LTHR for a user+sport: Intervals sport-settings first,
 * then local_sport_settings fallback. Shared by TrainingLoadCalculator
 * and GarminWorkoutMapper — single point of truth for thresholds.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminSportSettingsService {

    private final LocalSportSettingsRepository localSportSettingsRepository;
    private final IntervalsAthleteService intervalsAthleteService;
    private final UserRepository userRepository;

    public Double ftpWatts(Long userId, String sportKey) {
        try {
            String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
            if (username != null) {
                JsonNode settings = intervalsAthleteService.getSportSettings(username);
                Integer ftp = intervalsAthleteService.getFtpForSport(settings, toIntervalsType(sportKey));
                if (ftp != null && ftp > 0) return ftp.doubleValue();
            }
        } catch (Exception ignored) {}
        return localSportSettingsRepository.findByUserIdAndSportKey(userId, sportKeyOrDefault(sportKey))
                .map(LocalSportSettings::getFtp).map(Integer::doubleValue).orElse(null);
    }

    public Integer lthr(Long userId, String sportKey) {
        try {
            String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
            if (username != null) {
                JsonNode settings = intervalsAthleteService.getSportSettings(username);
                Integer lthr = intervalsAthleteService.getLthrForSport(settings, toIntervalsType(sportKey));
                if (lthr != null && lthr > 0) return lthr;
            }
        } catch (Exception ignored) {}
        return localSportSettingsRepository.findByUserIdAndSportKey(userId, sportKeyOrDefault(sportKey))
                .map(LocalSportSettings::getLthr).orElse(null);
    }

    /** Athlete resting HR from the Intervals profile (icu_resting_hr). */
    public Integer restingHr(Long userId) {
        try {
            String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
            if (username != null) {
                JsonNode athlete = (JsonNode) intervalsAthleteService.getAthleteProfile(username).get("athlete");
                int rhr = athlete.path("icu_resting_hr").asInt(0);
                if (rhr > 0) return rhr;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** Athlete sex from the Intervals profile ("M"/"F"). */
    public String sex(Long userId) {
        try {
            String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
            if (username != null) {
                JsonNode athlete = (JsonNode) intervalsAthleteService.getAthleteProfile(username).get("athlete");
                String sex = athlete.path("sex").asText(null);
                if (sex != null && !sex.isBlank()) return sex;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** Max HR for a sport — Intervals sport-settings, any sport's max as fallback. */
    public Integer maxHr(Long userId, String sportKey) {
        try {
            String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
            if (username != null) {
                JsonNode settings = intervalsAthleteService.getSportSettings(username);
                Integer maxHr = intervalsAthleteService.getMaxHrForSport(settings, toIntervalsType(sportKey));
                if (maxHr != null && maxHr > 0) return maxHr;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String sportKeyOrDefault(String sportKey) {
        return sportKey != null ? sportKey : "ride";
    }

    private String toIntervalsType(String sportKey) {
        if (sportKey == null) return "Ride";
        return switch (sportKey) {
            case "run" -> "Run";
            case "swim" -> "Swim";
            case "walk" -> "Walk";
            default -> "Ride";
        };
    }
}
