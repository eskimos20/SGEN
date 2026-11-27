package com.sgen.service.garmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sgen.entity.LocalSportSettings;
import com.sgen.repository.LocalSportSettingsRepository;
import com.sgen.repository.UserRepository;
import com.sgen.service.IntervalsAthleteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Resolves FTP/LTHR for a user+sport. For Garmin-connected users the athlete
 * mirror (intervals_athlete) is the source — it is refreshed ~daily by the
 * statistics fetch — with one bounded live fetch only when the mirror is
 * cold. Non-Garmin users keep the live Intervals lookup. Local
 * local_sport_settings rows are the final fallback. Shared by
 * TrainingLoadCalculator and GarminWorkoutMapper — single point of truth
 * for thresholds.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GarminSportSettingsService {

    private final LocalSportSettingsRepository localSportSettingsRepository;
    private final IntervalsAthleteService intervalsAthleteService;
    private final UserRepository userRepository;
    private final IntervalsMirrorService intervalsMirrorService;
    private final GarminClientFactory garminClientFactory;
    private final ObjectMapper objectMapper;

    public Double ftpWatts(Long userId, String sportKey) {
        return ftpWatts(userId, sportKey, null);
    }

    /**
     * FTP for a user+sport. When intervalsType is set (e.g. "NordicSki" — the
     * resolved Intervals type of the activity) it is matched against the
     * user's sport-settings `types` first; the sport_key-mapped type is the
     * fallback, then local_sport_settings.
     */
    public Double ftpWatts(Long userId, String sportKey, String intervalsType) {
        try {
            JsonNode settings = sportSettings(userId);
            for (String t : lookupTypes(sportKey, intervalsType)) {
                Integer ftp = intervalsAthleteService.getFtpForSport(settings, t);
                if (ftp != null && ftp > 0) return ftp.doubleValue();
            }
        } catch (Exception ignored) {}
        return localSportSettingsRepository.findByUserIdAndSportKey(userId, sportKeyOrDefault(sportKey))
                .map(LocalSportSettings::getFtp).map(Integer::doubleValue).orElse(null);
    }

    public Integer lthr(Long userId, String sportKey) {
        return lthr(userId, sportKey, null);
    }

    /** LTHR — same lookup order as {@link #ftpWatts}. */
    public Integer lthr(Long userId, String sportKey, String intervalsType) {
        try {
            JsonNode settings = sportSettings(userId);
            for (String t : lookupTypes(sportKey, intervalsType)) {
                Integer lthr = intervalsAthleteService.getLthrForSport(settings, t);
                if (lthr != null && lthr > 0) return lthr;
            }
        } catch (Exception ignored) {}
        return localSportSettingsRepository.findByUserIdAndSportKey(userId, sportKeyOrDefault(sportKey))
                .map(LocalSportSettings::getLthr).orElse(null);
    }

    /**
     * Custom HR zone upper bounds in BPM from sport settings (hr_zones),
     * for the given sport. Null when not configured — callers should fall
     * back to %LTHR defaults.
     */
    public double[] hrZoneBoundsBpm(Long userId, String sportKey) {
        return hrZoneBoundsBpm(userId, sportKey, null);
    }

    public double[] hrZoneBoundsBpm(Long userId, String sportKey, String intervalsType) {
        return zoneBounds(userId, sportKey, intervalsType, "hr_zones");
    }

    /**
     * Custom power zone upper bounds in % of FTP from sport settings
     * (power_zones). Null when not configured.
     */
    public double[] powerZoneBoundsPct(Long userId, String sportKey) {
        return powerZoneBoundsPct(userId, sportKey, null);
    }

    public double[] powerZoneBoundsPct(Long userId, String sportKey, String intervalsType) {
        return zoneBounds(userId, sportKey, intervalsType, "power_zones");
    }

    private double[] zoneBounds(Long userId, String sportKey, String intervalsType, String field) {
        try {
            JsonNode settings = sportSettings(userId);
            for (String t : lookupTypes(sportKey, intervalsType)) {
                double[] b = intervalsAthleteService.getZoneBoundsForSport(settings, t, field);
                if (b != null && b.length > 0) return b;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /**
     * Sport-settings array for the user. Garmin-connected: the athlete
     * mirror first (refreshed ~daily by fetchMirroredDoc); a single live
     * fetch only when the mirror is cold, persisted right back so the next
     * lookup is local. Others: live Intervals (unchanged behavior).
     */
    private JsonNode sportSettings(Long userId) {
        boolean garmin = garminClientFactory.isConnected(userId);
        if (garmin) {
            String cached = intervalsMirrorService.findAthleteJson(userId, "sport-settings");
            if (cached != null) {
                try { return objectMapper.readTree(cached); } catch (Exception ignored) {}
            }
        }
        String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
        if (username == null) return null;
        JsonNode settings = intervalsAthleteService.getSportSettings(username);
        if (settings != null && garmin) {
            try {
                intervalsMirrorService.saveAthleteProfile(userId, null,
                        objectMapper.writeValueAsString(settings));
            } catch (Exception ignored) {}
        }
        return settings;
    }

    /** Athlete profile JSON — same mirror-first policy as sportSettings. */
    private JsonNode athlete(Long userId) {
        boolean garmin = garminClientFactory.isConnected(userId);
        if (garmin) {
            String cached = intervalsMirrorService.findAthleteJson(userId, "athlete");
            if (cached != null) {
                try { return objectMapper.readTree(cached); } catch (Exception ignored) {}
            }
        }
        String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse(null);
        if (username == null) return null;
        try {
            JsonNode a = (JsonNode) intervalsAthleteService.getAthleteProfile(username).get("athlete");
            if (a != null && garmin) {
                try {
                    intervalsMirrorService.saveAthleteProfile(userId,
                            objectMapper.writeValueAsString(a), null);
                } catch (Exception ignored) {}
            }
            return a;
        } catch (Exception ignored) {}
        return null;
    }

    /**
     * Settings lookup order: the resolved Intervals activity type first
     * ("NordicSki"), then the coarse sport_key mapping ("other" → "Ride").
     */
    private List<String> lookupTypes(String sportKey, String intervalsType) {
        List<String> out = new ArrayList<>(2);
        if (intervalsType != null && !intervalsType.isBlank()) out.add(intervalsType);
        String mapped = toIntervalsType(sportKey);
        if (!out.contains(mapped)) out.add(mapped);
        return out;
    }

    /** Athlete resting HR (icu_resting_hr). */
    public Integer restingHr(Long userId) {
        try {
            JsonNode athlete = athlete(userId);
            int rhr = athlete != null ? athlete.path("icu_resting_hr").asInt(0) : 0;
            if (rhr > 0) return rhr;
        } catch (Exception ignored) {}
        return null;
    }

    /** Athlete sex from the profile ("M"/"F"). */
    public String sex(Long userId) {
        try {
            JsonNode athlete = athlete(userId);
            String sex = athlete != null ? athlete.path("sex").asText(null) : null;
            if (sex != null && !sex.isBlank()) return sex;
        } catch (Exception ignored) {}
        return null;
    }

    /** Max HR for a sport — sport-settings, any sport's max as fallback. */
    public Integer maxHr(Long userId, String sportKey) {
        return maxHr(userId, sportKey, null);
    }

    public Integer maxHr(Long userId, String sportKey, String intervalsType) {
        try {
            JsonNode settings = sportSettings(userId);
            String preferred = intervalsType != null && !intervalsType.isBlank()
                    ? intervalsType : toIntervalsType(sportKey);
            Integer maxHr = intervalsAthleteService.getMaxHrForSport(settings, preferred);
            if (maxHr != null && maxHr > 0) return maxHr;
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
