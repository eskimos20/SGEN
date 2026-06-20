package com.sgen.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Rate limiter for Intervals.icu API calls.
 * Enforces both limits:
 * - Max 30 requests per second
 * - Max 132 requests per 10 seconds
 */
@Component
@Slf4j
public class IntervalsApiRateLimiter {
    
    // Per-second limit (30/s)
    private static final int MAX_REQUESTS_PER_SECOND = 30;
    private static final long SECOND_WINDOW_MILLIS = 1_000; // 1 second
    
    // 10-second limit (132/10s)
    private static final int MAX_REQUESTS_PER_TEN_SECONDS = 100; // Safe margin
    private static final long TEN_SECOND_WINDOW_MILLIS = 10_000; // 10 seconds
    
    private final ConcurrentLinkedQueue<Long> requestTimestamps = new ConcurrentLinkedQueue<>();
    private final Lock lock = new ReentrantLock();
    
    /**
     * Acquire permission to make an API call.
     * This method will block if necessary to stay within both rate limits:
     * - 30 requests per second
     * - 132 requests per 10 seconds
     */
    public void acquire() {
        lock.lock();
        try {
            long now = Instant.now().toEpochMilli();
            
            // Remove timestamps older than the windows
            cleanupOldTimestamps(now);
            
            // Check both limits and wait if necessary
            while (true) {
                int requestsInLastSecond = countRequestsInWindow(now, SECOND_WINDOW_MILLIS);
                int requestsInLastTenSeconds = countRequestsInWindow(now, TEN_SECOND_WINDOW_MILLIS);
                
                // Check if we're within both limits
                if (requestsInLastSecond < MAX_REQUESTS_PER_SECOND && 
                    requestsInLastTenSeconds < MAX_REQUESTS_PER_TEN_SECONDS) {
                    break;
                }
                
                // Calculate wait time based on which limit is exceeded
                long timeToWait = 0;
                String limitType = "";
                
                if (requestsInLastSecond >= MAX_REQUESTS_PER_SECOND) {
                    // Per-second limit exceeded - wait until next second
                    Long oldestInSecond = findOldestTimestampInWindow(now, SECOND_WINDOW_MILLIS);
                    if (oldestInSecond != null) {
                        timeToWait = (oldestInSecond + SECOND_WINDOW_MILLIS) - now;
                        limitType = "per-second";
                    }
                } else if (requestsInLastTenSeconds >= MAX_REQUESTS_PER_TEN_SECONDS) {
                    // 10-second limit exceeded - wait until oldest request is outside window
                    Long oldestInTenSeconds = findOldestTimestampInWindow(now, TEN_SECOND_WINDOW_MILLIS);
                    if (oldestInTenSeconds != null) {
                        timeToWait = (oldestInTenSeconds + TEN_SECOND_WINDOW_MILLIS) - now;
                        limitType = "10-second";
                    }
                }
                
                if (timeToWait > 0) {
                    log.debug("Rate limit reached ({}). Waiting {}ms before next request ({} in last second, {} in last 10s)", 
                             limitType, timeToWait, requestsInLastSecond, requestsInLastTenSeconds);
                    try {
                        Thread.sleep(timeToWait);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException("Rate limiter interrupted", e);
                    }
                    now = Instant.now().toEpochMilli();
                    cleanupOldTimestamps(now);
                } else {
                    break;
                }
            }
            
            // Record this request
            requestTimestamps.offer(now);
            
            if (log.isTraceEnabled()) {
                int requestsInLastSecond = countRequestsInWindow(now, SECOND_WINDOW_MILLIS);
                int requestsInLastTenSeconds = countRequestsInWindow(now, TEN_SECOND_WINDOW_MILLIS);
                log.trace("API call permitted. Current: {}/{} per second, {}/{} per 10s", 
                         requestsInLastSecond, MAX_REQUESTS_PER_SECOND,
                         requestsInLastTenSeconds, MAX_REQUESTS_PER_TEN_SECONDS);
            }
            
        } finally {
            lock.unlock();
        }
    }
    
    /**
     * Remove timestamps that are outside the current window
     */
    private void cleanupOldTimestamps(long now) {
        long windowStart = now - TEN_SECOND_WINDOW_MILLIS; // Use the larger window
        while (!requestTimestamps.isEmpty()) {
            Long timestamp = requestTimestamps.peek();
            if (timestamp != null && timestamp < windowStart) {
                requestTimestamps.poll();
            } else {
                break;
            }
        }
    }
    
    /**
     * Count requests in the specified time window
     */
    private int countRequestsInWindow(long now, long windowSize) {
        long windowStart = now - windowSize;
        int count = 0;
        for (Long timestamp : requestTimestamps) {
            if (timestamp != null && timestamp >= windowStart) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * Find the oldest timestamp in the specified window
     */
    private Long findOldestTimestampInWindow(long now, long windowSize) {
        long windowStart = now - windowSize;
        Long oldest = null;
        for (Long timestamp : requestTimestamps) {
            if (timestamp != null && timestamp >= windowStart) {
                if (oldest == null || timestamp < oldest) {
                    oldest = timestamp;
                }
            }
        }
        return oldest;
    }
    
    /**
     * Get current number of requests in the window (for monitoring/debugging)
     */
    public int getCurrentRequestCount() {
        long now = Instant.now().toEpochMilli();
        cleanupOldTimestamps(now);
        return requestTimestamps.size();
    }
    
    /**
     * Reset the rate limiter (useful for testing)
     */
    public void reset() {
        lock.lock();
        try {
            requestTimestamps.clear();
            log.debug("Rate limiter reset");
        } finally {
            lock.unlock();
        }
    }
}
