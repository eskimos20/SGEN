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
            // If we get a parameter error, silently retry with the alternative parameter
            if (e.getMessage() != null && e.getMessage().contains("max_tokens") && e.getMessage().contains("max_completion_tokens")) {
                log.debug("Auto-correcting token parameter for model: {}", model);
                return makeApiCall(username, apiKey, model, prompt, data, conversationHistory, true, true, startTime);
            }
            throw e;
        }
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
            "elevationGain, and interval_summary with per-interval power/HR/zone data\n" +
            "- fitness: current CTL (chronic training load/fitness), ATL (acute training load/fatigue), TSB (training stress balance/form = CTL-ATL)\n" +
            "- wellness[]: daily tracking with CTL, ATL, form (TSB), rampRate, HRV, hrvSDNN, restingHR, sleepHours, sleepScore\n" +
            "- weeklyVolumeLoadSummary[]: weekly totals with hours, TSS, session count by type, deload week flags\n" +
            "- upcomingWorkouts[]: planned future sessions if available\n\n" +
            "CRITICAL RULE - FACTS ONLY:\n" +
            "Base ALL analysis exclusively on the provided data. NEVER invent, assume, or hallucinate metrics, values, or trends. " +
            "When you make a data-based claim, cite the specific date, number, or percentage. " +
            "If data is missing or insufficient, say so plainly in one sentence and name the exact data point needed.\n\n" +
            "DOMAIN KNOWLEDGE TO APPLY:\n" +
            "- TSB > +15 = very fresh/detrained, +5 to +15 = good form for racing, -10 to +5 = functional training, < -10 = accumulating fatigue, < -30 = overreaching risk\n" +
            "- Decoupling < 5% = good aerobic efficiency, > 5% = cardiac drift indicating fatigue or insufficient base fitness\n" +
            "- Ramp rate > 5-7 TSS/day per week = injury/overtraining risk\n" +
            "- Intensity Factor (IF): <0.75 recovery/endurance, 0.75-0.85 tempo, 0.85-0.95 threshold, >0.95 VO2max+\n" +
            "- Use the athlete's sport-specific thresholds (FTP, LTHR, threshold pace) from sportSettings when evaluating intensity\n" +
            "- Zones overlap: sweet spot (~88-94% FTP) sits at the top of Z3 / bottom of Z4, and tempo/Z3, sweet spot, and threshold/Z4 form one continuum, not separate buckets\n\n" +
            "CONCISENESS - THIS IS THE #1 PRIORITY. DEFAULT TO BRIEF:\n" +
            "- Match length to the question and never pad:\n" +
            "  * Simple/general question -> 1-3 sentences, no headings, no bullets.\n" +
            "  * Analysis or 'how do I change/improve X' question -> a SHORT structured reply: a one-sentence direct answer, then AT MOST 3-5 bullets covering ONLY the most important data-backed points, then one short recommendation. Target under ~150 words.\n" +
            "  * Go longer (multiple sections, deeper detail) ONLY when the user explicitly asks for a 'detailed', 'in-depth', 'thorough', or 'full' analysis.\n" +
            "- Include only the few most relevant data points. Do NOT list every session, metric, week, or angle — pick the ones that actually drive your conclusion.\n" +
            "- State every point, recommendation, and number EXACTLY ONCE. Never rephrase or restate the same idea in different words.\n" +
            "- If two options are equivalent (e.g. 4x15min vs 3x20min), present them together once.\n" +
            "- Lead with the direct answer first. Cut filler, motivational padding, and generic intros.\n" +
            "- Do NOT end with an offer to do more (e.g. 'Want me to build a full plan?') unless the user asked for next steps.\n\n" +
            "BEHAVIOR:\n" +
            "- Answer ANY question naturally — training, nutrition, recovery, gear, race strategy, or even off-topic. Act like ChatGPT with sports expertise.\n" +
            "- When analyzing data, cite specific numbers, dates, and trends, compare periods, spot patterns, and give actionable advice based ONLY on the provided data.\n" +
            "- Keep advice internally consistent: do NOT tell the athlete to cut a zone/intensity while also prescribing work in that same zone (e.g. 'reduce Z3' plus 'add sweet spot', which overlap). Reconcile overlapping bands or state the distinction explicitly.\n" +
            "- Never repeat what the user just said. Proactively flag genuine concerns (overtraining, insufficient recovery, imbalanced distribution) only when supported by data.\n" +
            "- Maintain full conversation context and reference previous messages when relevant.\n" +
            "- ALWAYS respond in the same language the user writes in.\n\n" +
            "RESPONSE FORMAT:\n" +
            "- Use markdown and complete sentences. Use **bold** only for the few key metrics or takeaways.\n" +
            "- Prefer a short answer with NO headings. Use bullets sparingly (max ~5) and only when they make a short answer clearer.\n" +
            "- Use **bold headings** and tables ONLY for an explicitly requested in-depth analysis, never for a normal answer.\n" +
            "- For workout recommendations, give the structure once: goal, warm-up, main set, cool-down.\n" +
            "- No emojis unless the user uses them first.\n\n" +
            "BEFORE RESPONDING, VERIFY:\n" +
            "(1) The length fits the question and nothing is padded — default to brief, long form only if explicitly requested, " +
            "(2) No point, recommendation, or number is stated more than once in different words, " +
            "(3) Only the most relevant data points are included, not an exhaustive list, " +
            "(4) Every cited number exists in the provided data and nothing was invented, " +
            "(5) There is no closing offer to do more unless the user asked, " +
            "(6) No two recommendations contradict each other (e.g. cutting a zone while prescribing work inside it).";

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

            // Determine model characteristics
            // Note: All gpt-5 models (including chat variants) and o-series don't support temperature parameter
            boolean isReasoningModel = model.startsWith("o1") || model.startsWith("o3") ||
                    (model.startsWith("gpt-5") && !model.contains("chat"));
            boolean isGpt5Model = model.startsWith("gpt-5");  // Includes both reasoning and chat variants
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

            // Dynamic temperature: lower for analysis (precise), higher for general questions
            // Note: All GPT-5 models (including chat variants) and o-series only support temperature=1 (default)
            boolean isAnalysisQuestion = prompt.toLowerCase().matches(".*(analyze|analysera|vad tycker|how is|trend|pattern|compare|jämför).*");
            double temperature = (isReasoningModel || isGpt5Model) ? 1.0 : (isAnalysisQuestion ? 0.3 : 0.7);

            // Only add temperature for non-GPT-5, non-reasoning models
            if (!isReasoningModel && !isGpt5Model) {
                requestBody.put("temperature", temperature);
            }

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
