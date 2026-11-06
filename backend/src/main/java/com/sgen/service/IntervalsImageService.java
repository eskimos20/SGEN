package com.sgen.service;

import com.sgen.service.IntervalsClientFactory.ApiContext;
import com.sgen.service.garmin.GarminClientFactory;
import com.sgen.service.garmin.IntervalsMirrorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Serves the rendered activity images (map.png / power.png) that Intervals
 * generates. For Garmin-connected users the bytes are cached in the local
 * mirror so repeated views don't hit the API again.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IntervalsImageService {

    private static final Map<String, String> PATHS = Map.of(
            "map", "/api/v1/activity/{id}/map.png",
            "chart", "/api/v1/activity/{id}/power.png");

    private final UserService userService;
    private final IntervalsClientFactory clientFactory;
    private final GarminClientFactory garminClientFactory;
    private final IntervalsMirrorService intervalsMirrorService;

    public byte[] getImage(String username, String activityId, String kind) {
        String path = PATHS.get(kind);
        if (path == null) throw new IllegalArgumentException("Unknown image kind: " + kind);
        ApiContext ctx = clientFactory.buildContext(userService, username);
        Long uid = ctx.user.getId();
        boolean garminConnected = garminClientFactory.isConnected(uid);
        if (garminConnected) {
            byte[] cached = intervalsMirrorService.findImage(uid, activityId, kind);
            if (cached != null && cached.length > 0) {
                log.info("SOURCE=DB user {} {}.png served from local mirror: {}", username, kind, activityId);
                return cached;
            }
        }
        try {
            byte[] png = ctx.client.get()
                    .uri(path, activityId)
                    .retrieve().bodyToMono(byte[].class).block();
            if (garminConnected) intervalsMirrorService.saveImage(uid, activityId, kind, png);
            return png;
        } catch (Exception e) {
            return null;
        }
    }

    public byte[] getActivityMapImage(String username, String activityId) {
        return getImage(username, activityId, "map");
    }

    public byte[] getActivityChartImage(String username, String activityId) {
        return getImage(username, activityId, "chart");
    }
}
