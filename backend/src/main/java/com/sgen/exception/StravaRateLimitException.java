package com.sgen.exception;

/**
 * Exception thrown when Strava API rate limit is exceeded (HTTP 429)
 */
public class StravaRateLimitException extends RuntimeException {
    
    private final long retryAfterSeconds;
    
    public StravaRateLimitException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }
    
    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
    
    /**
     * Get human readable time until rate limit resets
     */
    public String getTimeUntilReset() {
        if (retryAfterSeconds <= 0) {
            return "soon";
        }
        
        long minutes = retryAfterSeconds / 60;
        long seconds = retryAfterSeconds % 60;
        
        if (minutes > 0) {
            return String.format("%d min %d sec", minutes, seconds);
        } else {
            return String.format("%d seconds", seconds);
        }
    }
}
