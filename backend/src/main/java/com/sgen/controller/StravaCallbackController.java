package com.sgen.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;

@Controller
public class StravaCallbackController {

    @Value("${app.frontend.url:http://localhost:8084}")
    private String frontendUrl;

    @GetMapping("/api/strava/callback")
    public RedirectView handleStravaCallback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String error,
            @RequestParam(required = false) String error_description,
            @RequestParam(required = false) String state) {
        
        // Redirect to frontend callback with all parameters
        StringBuilder redirectUrl = new StringBuilder(frontendUrl);
        redirectUrl.append("/strava-callback.html");
        
        boolean hasParams = false;
        
        if (code != null) {
            redirectUrl.append("?code=").append(code);
            hasParams = true;
        }
        
        if (error != null) {
            redirectUrl.append(hasParams ? "&" : "?").append("error=").append(error);
            hasParams = true;
            if (error_description != null) {
                redirectUrl.append("&error_description=").append(error_description);
            }
        }
        
        if (state != null && !state.isEmpty()) {
            redirectUrl.append(hasParams ? "&" : "?").append("state=").append(state);
        }
        
        return new RedirectView(redirectUrl.toString());
    }
}
