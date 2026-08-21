package com.sgen.controller;

import com.sgen.entity.FtpResult;
import com.sgen.entity.Vo2MaxResult;
import com.sgen.service.PerformanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/performance")
@RequiredArgsConstructor
@PreAuthorize("hasRole('USER')")
public class PerformanceController {

    private final PerformanceService performanceService;

    @GetMapping("/ftp/top3")
    public ResponseEntity<List<FtpResult>> getTop3Ftp(Authentication authentication) {
        String username = authentication.getName();
        List<FtpResult> results = performanceService.getTop3Ftp(username);
        return ResponseEntity.ok(results);
    }

    @GetMapping("/vo2max/top3")
    public ResponseEntity<List<Vo2MaxResult>> getTop3Vo2Max(Authentication authentication) {
        String username = authentication.getName();
        List<Vo2MaxResult> results = performanceService.getTop3Vo2Max(username);
        return ResponseEntity.ok(results);
    }
}
