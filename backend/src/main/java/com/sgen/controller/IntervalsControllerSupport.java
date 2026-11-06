package com.sgen.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.function.Supplier;

/**
 * Shared response wrapper for the Intervals endpoints: run the action, return
 * 200 with the value, and map any failure to the 400 {"error": message}
 * response every endpoint used to hand-write in a try/catch block.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class IntervalsControllerSupport {

    private final ObjectMapper objectMapper;

    /** Wrap a map-/object-valued action. */
    public <T> ResponseEntity<T> respond(Supplier<T> action, String label) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (Exception e) {
            log.error("{}: {}", label, e.getMessage());
            @SuppressWarnings("unchecked")
            T error = (T) Map.of("error", e.getMessage() != null ? e.getMessage() : "Request failed");
            return ResponseEntity.badRequest().body(error);
        }
    }

    /** Wrap a JsonNode-valued action (error body is a JSON object). */
    public ResponseEntity<JsonNode> respondJson(Supplier<JsonNode> action, String label) {
        try {
            return ResponseEntity.ok(action.get());
        } catch (Exception e) {
            log.error("{}: {}", label, e.getMessage());
            return ResponseEntity.badRequest().body(objectMapper.createObjectNode()
                    .put("error", e.getMessage() != null ? e.getMessage() : "Request failed"));
        }
    }
}
