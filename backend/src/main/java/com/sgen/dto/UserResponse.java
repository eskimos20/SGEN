package com.sgen.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {
    private Long id;
    private String username;
    private String role;
    private boolean mustChangePassword;
    private boolean hasIntervalsConfig;
    private String intervalsAthleteId;

    // OpenAI user-level configuration
    private boolean hasOpenAIConfig;
    private Boolean openaiEnabled;
    private String openaiModel;
    private Boolean openaiConnectionTested;

    // Strava OAuth configuration
    private Boolean stravaEnabled;
    private boolean hasStravaConfig;
    private boolean hasStravaToken;
    private String stravaClientId;
    private String stravaAuthorizationUrl;

    private LocalDateTime createdAt;
    private LocalDateTime lastLogin;
}
