package com.sgen.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sgen.entity.User;
import com.sgen.util.OpenAiRateLimiter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class OpenAIService {

    private final AIUsageService aiUsageService;
    private final UserService userService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final OpenAiRateLimiter rateLimiter;

    @Value("${openai.api.base-url}")
    private String openaiBaseUrl;

    public OpenAIService(AIUsageService aiUsageService, UserService userService,
                         ObjectMapper objectMapper, OpenAiRateLimiter rateLimiter) {
        this.aiUsageService = aiUsageService;
        this.userService = userService;
        this.objectMapper = objectMapper;
        this.rateLimiter = rateLimiter;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
    }

    /**
     * Test connection to OpenAI API
     */
    public boolean testConnection(String apiKey) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(openaiBaseUrl + "/models"))
                    .header("Authorization", "Bearer " + apiKey.trim())
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200;
        } catch (Exception e) {
            log.error("Failed to test OpenAI connection: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Get available models for a specific user using their API key
     */
    public List<String> getModelsForUser(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new RuntimeException("OpenAI API key not configured");
        }
        return fetchModels(apiKey);
    }

    private List<String> fetchModels(String apiKey) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(openaiBaseUrl + "/models"))
                    .header("Authorization", "Bearer " + apiKey.trim())
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.error("OpenAI API returned status {}: {}", response.statusCode(), response.body());
                throw new RuntimeException("OpenAI API error: HTTP " + response.statusCode());
            }

            List<String> models = new ArrayList<>();
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode data = root.get("data");
            if (data != null && data.isArray()) {
                for (JsonNode model : data) {
                    String modelId = model.get("id").asText();
                    if (modelId.startsWith("gpt-") || modelId.startsWith("o")) {
                        models.add(modelId);
                    }
                }
            }

            // Sort models with preferred ones first
            models.sort((a, b) -> {
                if (a.contains("gpt-4o") && !b.contains("gpt-4o")) return -1;
                if (!a.contains("gpt-4o") && b.contains("gpt-4o")) return 1;
                if (a.startsWith("o1") && !b.startsWith("o1")) return -1;
                if (!a.startsWith("o1") && b.startsWith("o1")) return 1;
                return a.compareTo(b);
            });

            return models;
        } catch (Exception e) {
            log.error("Failed to fetch models: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to fetch models: " + e.getMessage());
        }
    }

    public String analyzeWithAI(String username, String prompt, String data, List<java.util.Map<String, String>> conversationHistory) {
        log.info("Starting AI analysis with OpenAI");
        log.debug("User prompt: {}", prompt);
        long startTime = System.currentTimeMillis();

        // First check if user has their own OpenAI configuration
        User user = userService.getUserEntityByUsername(username);
        String apiKey = null;
        String model = null;

        if (user.getOpenaiEnabled() != null && user.getOpenaiEnabled()
                && user.getOpenaiConnectionTested() != null && user.getOpenaiConnectionTested()
                && user.getOpenaiApiKey() != null && !user.getOpenaiApiKey().isBlank()
                && user.getOpenaiModel() != null) {
            // Use user's own OpenAI configuration
            apiKey = user.getOpenaiApiKey();
            model = user.getOpenaiModel();
            log.info("Using user's personal OpenAI configuration with model: {}", model);
        } else {
            throw new RuntimeException("OpenAI not configured. Please configure OpenAI in your profile settings.");
        }

        // Try with our best guess first
        try {
            return makeApiCall(username, apiKey, model, prompt, data, conversationHistory, false, false, startTime);
        } catch (RuntimeException e) {
            // Check if it's a token limit error
            if (e.getMessage() != null && e.getMessage().contains("context_length_exceeded")) {
                log.error("Token limit exceeded for OpenAI API. Data size: {} chars", data.length());
                throw new RuntimeException("Too much data for AI analysis. Please select a shorter time period (max 1-2 months).");
            }
            // Older and newer models differ in which token limit parameter they accept.
            // Retry once with the alternative spelling when the API identifies either one.
            if (isTokenParameterError(e.getMessage())) {
                log.debug("Auto-correcting token parameter for model: {}", model);
                return makeApiCall(username, apiKey, model, prompt, data, conversationHistory, true, true, startTime);
            }
            throw e;
        }
    }

    private boolean isTokenParameterError(String message) {
        if (message == null) return false;
        String normalized = message.toLowerCase(java.util.Locale.ROOT);
        return normalized.contains("max_tokens") || normalized.contains("max_completion_tokens");
    }
    
    // Comprehensive system prompt for optimal AI analysis quality
    private static final String SYSTEM_PROMPT = "You are a world-class endurance sports coach and training analyst with deep expertise in " +
            "exercise physiology, periodization, performance testing, biomechanics, nutrition, and recovery. " +
            "You think like an experienced coach who knows the athlete personally.\n\n" +
            "DATA CONTEXT - Analyze ONLY this provided data:\n" +
            "The athlete's training data is provided as JSON in the first user message. Key fields:\n" +
            "- athlete: age, weight (kg), restingHr, sportSettings (FTP/threshold pace/HR zones per sport)\n" +
            "- periodSummary: total activities, hours, distance, training load (TSS), HR zone distribution for the period\n" +
            "- activities[]: individual sessions with name, type, date, duration (seconds), distanceKm, " +
            "avgWatts, maxWatts, normalizedPower, avgHr, maxHr, tss (training stress score), " +
            "intensity (IF, fraction of FTP), decoupling (aerobic efficiency drift %), " +
            "feel (1-5 subjective), rpe (1-10), cadence, pace (min:sec/km for running), " +
            "elevationGain, and interval_summary with per-interval power/HR/zone data:\n" +
            "  - WORK intervals: duration_sec, type, avg_watts, max_watts, start_hr (HR at interval start), end_hr (HR at interval end), avg_hr, zone\n" +
            "  - RECOVERY/REST intervals: duration_sec, type, avg_watts, max_watts, start_hr (HR at rest start), end_hr (HR at rest end), avg_hr, hrr (1-min heart rate recovery from preceding work interval), zone\n" +
            "- fitness: current CTL (chronic training load/fitness), ATL (acute training load/fatigue), TSB (training stress balance/form = CTL-ATL)\n" +
            "- wellness[]: daily tracking with CTL, ATL, form (TSB), rampRate, HRV, hrvSDNN, restingHR, sleepHours, sleepScore\n" +
            "- weeklyVolumeLoadSummary[]: weekly totals with hours, TSS, session count by type, deload week flags\n" +
            "- upcomingWorkouts[]: planned future sessions if available\n\n" +
            "PERSONAL DATA AND GENERAL KNOWLEDGE:\n" +
            "- For claims about this athlete's training, use only the supplied data. Never invent or assume values, sessions, trends, test results, or personal circumstances.\n" +
            "- Clearly separate measured facts from interpretation. Support important personal claims with the relevant date, period, or value when available.\n" +
            "- If the data is insufficient, say what is missing and how that limits the conclusion. Still answer with general guidance when useful, clearly labeling it as general rather than athlete-specific. Ask a follow-up only when the missing information materially changes the answer.\n" +
            "- Answer general questions using relevant general knowledge; do not imply that general guidance was proven by the athlete's data. Be clear when a question is outside the data provided.\n\n" +
            "TRAINING INTERPRETATION:\n" +
            "- Use the athlete's sport-specific FTP, LTHR, and threshold pace from sportSettings when available. Do not apply one sport's threshold to another sport.\n" +
            "- Treat TSB, decoupling, ramp rate, and IF ranges as rough coaching heuristics, not universal cutoffs or diagnoses. Interpret trends in context, including sport, conditions, training history, and recovery; explain uncertainty when it matters.\n" +
            "- TSB, decoupling, and ramp-rate values alone do not establish illness, injury, overtraining, or race readiness. Avoid medical diagnoses.\n" +
            "- Zones can overlap: sweet spot (~88-94% FTP) often sits around upper Z3/lower Z4. Treat tempo, sweet spot, and threshold as a continuum where appropriate, and avoid contradictory advice such as reducing Z3 while prescribing sweet spot without explaining the distinction.\n" +
            "- Make recommendations actionable and proportionate to the evidence. Prefer one or two clear changes, explain why, and account for recovery and upcoming workouts when that data is available.\n\n" +
            "LENGTH AND TONE:\n" +
            "- Lead with the direct answer. Be concise by default, but let the complexity of the question determine the necessary detail; do not omit an important caveat just to meet a word target.\n" +
            "- For a simple question, usually use 1-3 sentences. For a normal training analysis, give a short conclusion and up to 3-5 focused bullets, usually around 150 words or fewer. These are guidelines, not hard limits.\n" +
            "- Give a longer, structured explanation when the user asks for detail or the question genuinely needs it. Follow the user's requested format and level of detail.\n" +
            "- Include only the most relevant data points. Avoid repeating the same conclusion or recommendation, but repeat a number if needed for clarity. Avoid filler, generic introductions, motivational padding, and unsolicited closing offers.\n" +
            "- Answer questions naturally about training, nutrition, recovery, gear, race strategy, and other topics. Maintain conversation context and refer to earlier messages when useful.\n" +
            "- Respond in the same language as the user's latest message.\n\n" +
            "FORMATTING:\n" +
            "- Use clear, complete sentences and standard Markdown. Use bold sparingly for key metrics or takeaways.\n" +
            "- Prefer paragraphs for short answers. Use a few bullets when they improve readability. Use headings or tables when requested or when they clearly help organize a detailed answer.\n" +
            "- For a workout recommendation, state the goal and give the warm-up, main set, and cool-down once, with intensity tied to the athlete's relevant threshold when known.\n" +
            "- Emojis are allowed when the user asks for them or when one or two genuinely reinforce the message. Use them sparingly; omit them in formal, sensitive, or technical explanations.\n\n" +
            "FINAL CHECK:\n" +
            "Before responding, confirm that personal claims are supported by the supplied data, general guidance is not presented as personalized evidence, uncertainty is clear where relevant, recommendations are internally consistent, and the answer follows the user's requested language, detail, and format.";

    /**
     * Estimate token count using 4 characters per token approximation
     */
    private int estimateTokens(String text) {
        if (text == null || text.isEmpty()) return 0;
        return text.length() / 4;
    }

    // Context window limits by model family
    private static final int GPT4_CONTEXT_LIMIT = 8192;
    private static final int GPT4O_CONTEXT_LIMIT = 128000;
    private static final int GPT5_CONTEXT_LIMIT = 200000;

    private String makeApiCall(String username, String apiKey, String model, String prompt, String data,
                               List<java.util.Map<String, String>> conversationHistory,
                               boolean useAlternativeTokenParam, boolean suppressErrorLog, long startTime) {
        try {
            // Apply rate limiting before making API call
            rateLimiter.acquire(username);

            ObjectNode requestBody = objectMapper.createObjectNode();
            requestBody.put("model", model);

            // Determine model characteristics used for token budgeting and message layout.
            boolean isReasoningModel = model.startsWith("o1") || model.startsWith("o3") ||
                    (model.startsWith("gpt-5") && !model.contains("chat"));
            boolean isOlderModel = model.startsWith("gpt-3.5") ||
                                   (model.startsWith("gpt-4") && !model.startsWith("gpt-4o") && !model.startsWith("gpt-4-turbo"));

            // Token estimation for logging/monitoring (not blocking)
            int estimatedInputTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(prompt) + estimateTokens(data);
            if (conversationHistory != null) {
                for (java.util.Map<String, String> msg : conversationHistory) {
                    estimatedInputTokens += estimateTokens(msg.get("content"));
                }
            }

            int contextLimit = isOlderModel ? GPT4_CONTEXT_LIMIT :
                              (model.startsWith("gpt-4o") ? GPT4O_CONTEXT_LIMIT : GPT5_CONTEXT_LIMIT);

            // Log warning if approaching limit, but don't block the request
            if (estimatedInputTokens > contextLimit * 0.9) {
                log.warn("Large data period detected: {} tokens (limit: {}). AI may truncate or fail.", 
                        estimatedInputTokens, contextLimit);
            } else {
                log.debug("Estimated input tokens: {} / {}", estimatedInputTokens, contextLimit);
            }

            // Use max_tokens only for older models
            // Use max_completion_tokens for all newer models
            boolean useMaxTokens = useAlternativeTokenParam ? !isOlderModel : isOlderModel;

            // Reasoning models need more tokens for internal reasoning
            int maxTokens = isReasoningModel ? 8192 : 4096;

            if (useMaxTokens) {
                requestBody.put("max_tokens", maxTokens);
            } else {
                requestBody.put("max_completion_tokens", maxTokens);
            }

            // Leave temperature unset. It defaults to 1, and some newer models only
            // accept that default when the parameter is omitted entirely. Model IDs
            // are not a reliable capability registry, so don't infer support by prefix.

            ArrayNode messages = requestBody.putArray("messages");

            // For reasoning models, add context as first user message instead of system message
            if (isReasoningModel) {
                ObjectNode contextMessage = messages.addObject();
                contextMessage.put("role", "user");
                contextMessage.put("content", "Context: " + SYSTEM_PROMPT + "\n\nRespond as a coach.");

                ObjectNode ackMessage = messages.addObject();
                ackMessage.put("role", "assistant");
                ackMessage.put("content", "Understood. I'll analyze based strictly on the data provided.");
            } else {
                ObjectNode systemMessage = messages.addObject();
                systemMessage.put("role", "system");
                systemMessage.put("content", SYSTEM_PROMPT);
            }

            // Check if this is first message or follow-up
            boolean isFirstUserMessage = (conversationHistory == null || conversationHistory.isEmpty());

            // For follow-ups: re-inject training data as reference before conversation history
            if (!isFirstUserMessage) {
                ObjectNode dataContext = messages.addObject();
                dataContext.put("role", "user");
                dataContext.put("content", "[Training data reference]\n" + data);

                ObjectNode dataAck = messages.addObject();
                dataAck.put("role", "assistant");
                dataAck.put("content", "I have the training data for reference.");
            }

            // Add conversation history
            if (conversationHistory != null && !conversationHistory.isEmpty()) {
                for (java.util.Map<String, String> msg : conversationHistory) {
                    String role = msg.get("role");
                    String content = msg.get("content");
                    if (role != null && content != null) {
                        ObjectNode historyMessage = messages.addObject();
                        historyMessage.put("role", role);
                        historyMessage.put("content", content);
                    }
                }
            }

            // Build current user message with data on first call
            ObjectNode userMessage = messages.addObject();
            userMessage.put("role", "user");
            if (isFirstUserMessage) {
                userMessage.put("content", prompt + "\n\nTraining Data (analyze this ONLY):\n" + data);
            } else {
                userMessage.put("content", prompt);
            }

            String requestJson = objectMapper.writeValueAsString(requestBody);
            log.debug("Request size: {} bytes, estimated tokens: {}", requestJson.length(), estimatedInputTokens);

            log.info("Sending request to OpenAI API...");
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(openaiBaseUrl + "/chat/completions"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey.trim())
                    .timeout(Duration.ofMinutes(5))
                    .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                if (!suppressErrorLog) {
                    log.error("OpenAI API returned status {}: {}", response.statusCode(), response.body());
                }
                // Extract user-friendly error message from OpenAI response
                String errorMessage = extractOpenAIErrorMessage(response.body(), response.statusCode());
                throw new RuntimeException(errorMessage);
            }

            JsonNode responseJson = objectMapper.readTree(response.body());
            
            // Log token usage
            JsonNode usage = responseJson.get("usage");
            if (usage != null) {
                int promptTokens = usage.has("prompt_tokens") ? usage.get("prompt_tokens").asInt() : 0;
                int completionTokens = usage.has("completion_tokens") ? usage.get("completion_tokens").asInt() : 0;
                if (username != null && aiUsageService != null) {
                    aiUsageService.logUsage(username, model, promptTokens, completionTokens, "analyze");
                }
            }
            
            JsonNode choices = responseJson.get("choices");
            if (choices != null && choices.isArray() && choices.size() > 0) {
                JsonNode firstChoice = choices.get(0);
                JsonNode message = firstChoice.get("message");
                if (message != null) {
                    JsonNode content = message.get("content");
                    if (content != null && !content.isNull()) {
                        String text = content.asText();
                        if (text != null && !text.isEmpty()) {
                            long duration = System.currentTimeMillis() - startTime;
                            log.info("Successfully received AI analysis from OpenAI in {}ms", duration);
                            return text;
                        }
                    }
                    
                    // Check for refusal (newer models may use this)
                    JsonNode refusal = message.get("refusal");
                    if (refusal != null && !refusal.isNull()) {
                        String refusalText = refusal.asText();
                        if (refusalText != null && !refusalText.isEmpty()) {
                            throw new RuntimeException("AI refused to answer: " + refusalText);
                        }
                    }
                }
            }

            log.error("OpenAI API unexpected response format: {}", response.body());
            throw new RuntimeException("OpenAI did not return a response. Please try again.");
            
        } catch (java.net.http.HttpTimeoutException e) {
            long duration = System.currentTimeMillis() - startTime;
            log.error("OpenAI API timeout after {} ms (timeout limit: 5 minutes)", duration);
            throw new RuntimeException("OpenAI API timeout after " + (duration / 1000) + " seconds. Please try again.", e);
        } catch (java.io.IOException e) {
            long duration = System.currentTimeMillis() - startTime;
            log.error("OpenAI API network error after {} ms: {}", duration, e.getMessage());
            throw new RuntimeException("Network error connecting to OpenAI: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            long duration = System.currentTimeMillis() - startTime;
            log.error("OpenAI API call interrupted after {} ms", duration);
            Thread.currentThread().interrupt();
            throw new RuntimeException("OpenAI API call was interrupted", e);
        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            log.error("AI analysis failed after {}ms: {}", duration, e.getMessage(), e);
            throw new RuntimeException("AI analysis failed: " + e.getMessage(), e);
        }
    }

    private String extractOpenAIErrorMessage(String responseBody, int statusCode) {
        try {
            JsonNode errorJson = objectMapper.readTree(responseBody);
            JsonNode error = errorJson.get("error");
            if (error != null) {
                JsonNode messageNode = error.get("message");
                if (messageNode != null && !messageNode.isNull()) {
                    String message = messageNode.asText();
                    if (message != null && !message.isEmpty()) {
                        // Return user-friendly message for quota errors
                        String errorCode = error.has("code") ? error.get("code").asText() : "";
                        if ("insufficient_quota".equals(errorCode)) {
                            return "OpenAI quota exceeded. Please check your plan and billing at platform.openai.com";
                        }
                        return message;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not parse OpenAI error response: {}", e.getMessage());
        }
        return "OpenAI API error: HTTP " + statusCode;
    }
}
