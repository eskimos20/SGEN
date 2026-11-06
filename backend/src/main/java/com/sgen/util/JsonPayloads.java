package com.sgen.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import lombok.extern.slf4j.Slf4j;

import java.util.function.Function;

/**
 * Shared conversion of stored mirror rows to a JSON array of their payloads —
 * used wherever the local mirror is served (activities, events, wellness).
 */
@Slf4j
public final class JsonPayloads {

    private JsonPayloads() {}

    /**
     * Parse every row's stored payload JSON into one ArrayNode. Rows whose
     * payload is missing or unparsable are skipped with a debug log.
     */
    public static <T> ArrayNode toPayloadArray(Iterable<T> rows,
                                               Function<T, String> payloadExtractor,
                                               ObjectMapper objectMapper) {
        ArrayNode arr = objectMapper.createArrayNode();
        for (T row : rows) {
            String payload = payloadExtractor.apply(row);
            if (payload == null) continue;
            try {
                arr.add(objectMapper.readTree(payload));
            } catch (Exception e) {
                log.debug("Mirror payload parse failed: {}", e.getMessage());
            }
        }
        return arr;
    }
}
