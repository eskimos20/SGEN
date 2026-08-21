package com.sgen.exception;

/**
 * Exception thrown when Strava is not connected or no tokens are available.
 * This is a normal state (user has not enabled/connect Strava), not an error.
 */
public class StravaNotConnectedException extends RuntimeException {
    
    public StravaNotConnectedException(String message) {
        super(message);
    }
}
