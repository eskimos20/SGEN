package com.sgen.dto;

import lombok.Data;

@Data
public class UserProfileRequest {

    private String intervalsApiKey;

    private String intervalsAthleteId;

    // OpenAI user-level configuration
    private String openaiApiKey;

    private Boolean openaiEnabled;

    private String openaiModel;

    private Boolean openaiConnectionTested;

    // Strava OAuth configuration
    private Boolean stravaEnabled;
    private String stravaClientId;
    private String stravaClientSecret;
}
