package com.sgen.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Rate limiter for OpenAI API calls.
 * Enforces rate limits to avoid 429 errors:
 * - Max 60 requests per minute (conservative limit)
 * - Per-user tracking to prevent one user from consuming all quota
 */
@Component
@Slf4j
public class OpenAiRateLimiter {

    // Per-minute limit (60/min) - conservative for most OpenAI tiers
    private static final int MAX_REQUESTS_PER_MINUTE = 60;
    private static final long MINUTE_WINDOW_MILLIS = 60_000; // 1 minute

    // Per-user minute limit (20/min per user) - prevents one user from hogging
    private static final int MAX_REQUESTS_PER_USER_PER_MINUTE = 20;

    // Global rate limiter
    private final ConcurrentLinkedQueue<Long> requestTimestamps = new ConcurrentLinkedQueue<>();
    private final Lock globalLock = new ReentrantLock();

    // Per-user rate limiters
    private final ConcurrentLinkedQueue<UserRequest> userRequestTimestamps = new ConcurrentLinkedQueue<>();
    private final Lock userLock = new ReentrantLock();

    private static class UserRequest {
        final String username;
        final long timestamp;

        UserRequest(String username, long timestamp) {
            this.username = username;
            this.timestamp = timestamp;
        }
    }

    /**
     * Acquire permission to make an API call.
     * This method will block if necessary to stay within both global and per-user rate limits.
     */
    public void acquire(String username) {
        // Check global rate limit
        acquireGlobal();
        // Check per-user rate limit
        acquirePerUser(username);
    }

    private void acquireGlobal() {
        globalLock.lock();
        try {
            long now = Instant.now().toEpochMilli();
            cleanupOldTimestamps(now);

            while (true) {
                int requestsInLastMinute = countRequestsInWindow(now, MINUTE_WINDOW_MILLIS);

                if (requestsInLastMinute < MAX_REQUESTS_PER_MINUTE) {
                    break;
                }

                Long oldestInMinute = findOldestTimestampInWindow(now, MINUTE_WINDOW_MILLIS);
                long timeToWait = oldestInMinute != null
                        ? (oldestInMinute + MINUTE_WINDOW_MILLIS) - now
                        : 1000;

                log.debug("Global OpenAI rate limit reached. Waiting {}ms ({} in last minute)",
                        timeToWait, requestsInLastMinute);

                try {
                    Thread.sleep(Math.max(timeToWait, 100));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Rate limiter interrupted", e);
                }
                now = Instant.now().toEpochMilli();
                cleanupOldTimestamps(now);
            }

            requestTimestamps.offer(now);
        } finally {
            globalLock.unlock();
        }
    }

    private void acquirePerUser(String username) {
        userLock.lock();
        try {
            long now = Instant.now().toEpochMilli();
            cleanupOldUserRequests(now);

            while (true) {
                int userRequestsInLastMinute = countUserRequestsInWindow(username, now, MINUTE_WINDOW_MILLIS);

                if (userRequestsInLastMinute < MAX_REQUESTS_PER_USER_PER_MINUTE) {
                    break;
                }

                Long oldestUserRequest = findOldestUserRequestInWindow(username, now, MINUTE_WINDOW_MILLIS);
                long timeToWait = oldestUserRequest != null
                        ? (oldestUserRequest + MINUTE_WINDOW_MILLIS) - now
                        : 1000;

                log.debug("Per-user OpenAI rate limit reached for {}. Waiting {}ms ({} in last minute)",
                        username, timeToWait, userRequestsInLastMinute);

                try {
                    Thread.sleep(Math.max(timeToWait, 100));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Rate limiter interrupted", e);
                }
                now = Instant.now().toEpochMilli();
                cleanupOldUserRequests(now);
            }

            userRequestTimestamps.offer(new UserRequest(username, now));
        } finally {
            userLock.unlock();
        }
    }

    private void cleanupOldTimestamps(long now) {
        long windowStart = now - MINUTE_WINDOW_MILLIS;
        while (!requestTimestamps.isEmpty()) {
            Long timestamp = requestTimestamps.peek();
            if (timestamp != null && timestamp < windowStart) {
                requestTimestamps.poll();
            } else {
                break;
            }
        }
    }

    private void cleanupOldUserRequests(long now) {
        long windowStart = now - MINUTE_WINDOW_MILLIS;
        while (!userRequestTimestamps.isEmpty()) {
            UserRequest req = userRequestTimestamps.peek();
            if (req != null && req.timestamp < windowStart) {
                userRequestTimestamps.poll();
            } else {
                break;
            }
        }
    }

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

    private int countUserRequestsInWindow(String username, long now, long windowSize) {
        long windowStart = now - windowSize;
        int count = 0;
        for (UserRequest req : userRequestTimestamps) {
            if (req.username.equals(username) && req.timestamp >= windowStart) {
                count++;
            }
        }
        return count;
    }

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

    private Long findOldestUserRequestInWindow(String username, long now, long windowSize) {
        long windowStart = now - windowSize;
        Long oldest = null;
        for (UserRequest req : userRequestTimestamps) {
            if (req.username.equals(username) && req.timestamp >= windowStart) {
                if (oldest == null || req.timestamp < oldest) {
                    oldest = req.timestamp;
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
     * Get current number of requests for a specific user
     */
    public int getCurrentUserRequestCount(String username) {
        long now = Instant.now().toEpochMilli();
        cleanupOldUserRequests(now);
        return countUserRequestsInWindow(username, now, MINUTE_WINDOW_MILLIS);
    }

    /**
     * Reset the rate limiter (useful for testing)
     */
    public void reset() {
        globalLock.lock();
        userLock.lock();
        try {
            requestTimestamps.clear();
            userRequestTimestamps.clear();
            log.debug("OpenAI rate limiter reset");
        } finally {
            userLock.unlock();
            globalLock.unlock();
        }
    }
}
