package com.disaster.coord.client;

import com.disaster.coord.dto.PredictionDtos.*;
import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Severity;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;

/**
 * Enterprise client for Hugging Face Hosted Inference Providers Router.
 * Uses OpenAI-compatible Chat Completions API with structured JSON output contract.
 * Base URL: https://router.huggingface.co/v1/chat/completions
 * Model: Qwen/Qwen2.5-7B-Instruct (or HF_MODEL_ID)
 */
@Component
public class HuggingFaceInferenceClient {

    private static final Logger log = LoggerFactory.getLogger(HuggingFaceInferenceClient.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @Value("${huggingface.api.base-url:https://router.huggingface.co/v1}")
    private String baseUrl;

    @Value("${HF_TOKEN:${huggingface.api.token:}}")
    private String hfToken;

    @Value("${HF_MODEL_ID:${huggingface.api.model-id:Qwen/Qwen2.5-7B-Instruct}}")
    private String modelId;

    @Value("${huggingface.api.connect-timeout-ms:5000}")
    private int connectTimeoutMs;

    @Value("${huggingface.api.read-timeout-ms:15000}")
    private int readTimeoutMs;

    @Value("${huggingface.api.max-retries:2}")
    private int maxRetries;

    public HuggingFaceInferenceClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.restTemplate = createConfiguredRestTemplate(5000, 15000);
    }

    private static RestTemplate createConfiguredRestTemplate(int connectTimeout, int readTimeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);
        return new RestTemplate(factory);
    }

    public boolean isConfigured() {
        return hfToken != null && !hfToken.trim().isEmpty();
    }

    public String getMaskedToken() {
        if (!isConfigured()) return "NOT_CONFIGURED";
        String trimmed = hfToken.trim();
        if (trimmed.length() <= 8) return "********";
        return trimmed.substring(0, 4) + "..." + trimmed.substring(trimmed.length() - 4);
    }

    public String getModelId() {
        return (modelId != null && !modelId.trim().isEmpty()) ? modelId.trim() : "Qwen/Qwen2.5-7B-Instruct";
    }

    /**
     * Sends structured disaster assessment request to Hugging Face Router.
     * Only non-sensitive data (type, title, description) is transmitted.
     */
    public StructuredSeverityAssessment assessIncident(DisasterType type, String title, String description) {
        if (!isConfigured()) {
            throw new IllegalStateException("Hugging Face API token (HF_TOKEN) is not configured in backend environment.");
        }

        String targetModel = getModelId();
        String chatEndpoint = baseUrl.replaceAll("/+$", "") + "/chat/completions";

        String systemPrompt = buildSystemPrompt();
        String userPrompt = buildUserPrompt(type, title, description);

        HfChatCompletionRequest payload = HfChatCompletionRequest.builder()
                .model(targetModel)
                .messages(Arrays.asList(
                        HfChatMessage.builder().role("system").content(systemPrompt).build(),
                        HfChatMessage.builder().role("user").content(userPrompt).build()
                ))
                .temperature(0.1)
                .maxTokens(250)
                .responseFormat(Collections.singletonMap("type", "json_object"))
                .build();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + hfToken.trim());
        headers.set("User-Agent", "D-Connect-Backend-ML/1.0");

        HttpEntity<HfChatCompletionRequest> entity = new HttpEntity<>(payload, headers);

        int attempts = 0;
        Exception lastException = null;

        while (attempts <= maxRetries) {
            attempts++;
            try {
                log.info("Dispatching HF inference request to {} [model: {}, attempt: {}/{}]",
                        chatEndpoint, targetModel, attempts, maxRetries + 1);

                ResponseEntity<String> response = restTemplate.exchange(
                        chatEndpoint,
                        HttpMethod.POST,
                        entity,
                        String.class
                );

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    return parseAndValidateResponse(response.getBody());
                } else {
                    throw new RuntimeException("Unexpected non-2xx status from Hugging Face: " + response.getStatusCode());
                }

            } catch (HttpClientErrorException.Unauthorized ex) {
                log.error("Authentication failed with Hugging Face (HTTP 401). Check HF_TOKEN credential permissions.");
                throw new SecurityException("Unauthorized: Invalid or expired Hugging Face token. " + ex.getMessage(), ex);

            } catch (HttpClientErrorException.TooManyRequests ex) {
                lastException = ex;
                log.warn("Hugging Face router rate limit / quota exceeded (HTTP 429) on attempt {}/{}", attempts, maxRetries + 1);
                if (attempts <= maxRetries) {
                    sleepBackoff(attempts);
                    continue;
                }
                throw new RuntimeException("Hugging Face inference rate-limit/quota exhausted: " + ex.getMessage(), ex);

            } catch (HttpClientErrorException.NotFound ex) {
                log.error("Hugging Face model or route not found (HTTP 404). Model: {}", targetModel);
                throw new IllegalArgumentException("Model or provider route not found: " + targetModel, ex);

            } catch (HttpServerErrorException | ResourceAccessException ex) {
                lastException = ex;
                log.warn("Transient error from Hugging Face router on attempt {}/{}: {}", attempts, maxRetries + 1, ex.getMessage());
                if (attempts <= maxRetries) {
                    sleepBackoff(attempts);
                    continue;
                }
            } catch (Exception ex) {
                log.error("Unhandled error calling Hugging Face inference API: {}", ex.getMessage());
                throw (ex instanceof RuntimeException ? (RuntimeException) ex : new RuntimeException(ex));
            }
        }

        throw new RuntimeException("Exhausted retries calling Hugging Face router API: " + (lastException != null ? lastException.getMessage() : "Unknown error"), lastException);
    }

    private void sleepBackoff(int attempt) {
        long sleepMs = (long) (Math.pow(2, attempt - 1) * 750);
        try {
            Thread.sleep(sleepMs);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private String buildSystemPrompt() {
        return "You are an automated emergency disaster assessment AI for first responder dispatch coordination.\n"
                + "Assess the incident report and classify its severity strictly into one of the following 4 categories:\n"
                + "- LOW: Minor localized incident, small kitchen fire extinguished, trash fire, light weather, minor water leak, no injuries, no structural damage.\n"
                + "- MEDIUM: Localized property damage, localized water logging/drainage overflow, fallen tree blocking road, localized power outage, river near alert mark, no reported casualties.\n"
                + "- HIGH: Major emergency, active structural apartment fire, severe flooding of neighborhoods, category 3+ storm landfall, bridge damage, toxic leak requiring evacuation, multiple injuries.\n"
                + "- CRITICAL: Catastrophic disaster, people trapped in collapsed buildings, raging wildfire engulfing town, dam breach, super typhoon, mass casualties, active life threat.\n\n"
                + "RESPONSE CONTRACT:\n"
                + "Respond ONLY with a valid JSON object matching this exact schema:\n"
                + "{\n"
                + "  \"severity\": \"LOW\" | \"MEDIUM\" | \"HIGH\" | \"CRITICAL\",\n"
                + "  \"reason\": \"One or two sentences explaining the classification.\",\n"
                + "  \"evidence\": \"Specific keywords, numbers, or phrases from the report.\"\n"
                + "}\n"
                + "Do NOT include markdown fences, comments, or preamble outside the JSON.";
    }

    private String buildUserPrompt(DisasterType type, String title, String description) {
        StringBuilder sb = new StringBuilder();
        if (type != null) {
            sb.append("Incident Type: ").append(type.name()).append("\n");
        }
        if (title != null && !title.isBlank()) {
            sb.append("Incident Title: ").append(title.trim()).append("\n");
        }
        sb.append("Incident Description: ").append(description != null ? description.trim() : "None provided");
        return sb.toString();
    }

    /**
     * Parses raw response JSON and strictly validates the severity contract.
     */
    public StructuredSeverityAssessment parseAndValidateResponse(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            throw new IllegalArgumentException("Hugging Face API returned empty response body.");
        }

        try {
            JsonNode root = objectMapper.readTree(rawBody);

            // 1. Check for API error response
            if (root.has("error")) {
                String errMsg = root.get("error").has("message")
                        ? root.get("error").get("message").asText()
                        : root.get("error").asText();
                throw new RuntimeException("Hugging Face returned API error: " + errMsg);
            }

            // 2. Extract content from choices[0].message.content
            JsonNode choices = root.get("choices");
            if (choices == null || !choices.isArray() || choices.isEmpty()) {
                throw new IllegalArgumentException("Invalid Hugging Face response: choices array is missing or empty.");
            }

            JsonNode firstChoice = choices.get(0);
            JsonNode messageNode = firstChoice.get("message");
            if (messageNode == null || !messageNode.has("content")) {
                throw new IllegalArgumentException("Invalid Hugging Face response: choice message content is missing.");
            }

            String content = messageNode.get("content").asText().trim();

            // Strip optional markdown code blocks if the model wrapped it (e.g., ```json ... ```)
            if (content.startsWith("```")) {
                content = content.replaceAll("^```(?:json)?\\s*", "").replaceAll("\\s*```$", "").trim();
            }

            // 3. Parse structured JSON from content
            JsonNode assessmentNode = objectMapper.readTree(content);

            if (!assessmentNode.has("severity") || assessmentNode.get("severity").isNull()) {
                throw new IllegalArgumentException("Response missing required 'severity' key in JSON: " + content);
            }

            String rawSeverity = assessmentNode.get("severity").asText().trim().toUpperCase();

            // Validate against supported enum categories
            Severity normalizedSeverity;
            try {
                normalizedSeverity = Severity.valueOf(rawSeverity);
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("Unsupported severity value '" + rawSeverity + "'. Expected LOW, MEDIUM, HIGH, or CRITICAL.");
            }

            String reason = assessmentNode.has("reason") ? assessmentNode.get("reason").asText().trim() : "Automated severity assessment";
            String evidence = assessmentNode.has("evidence") ? assessmentNode.get("evidence").asText().trim() : "Extracted from description text";

            if (reason.isBlank()) reason = "No detailed rationale provided by model.";
            if (evidence.isBlank()) evidence = "No explicit evidence keywords extracted.";

            log.info("Validated HF inference assessment: Severity={}, Reason='{}'", normalizedSeverity, reason);

            return StructuredSeverityAssessment.builder()
                    .severity(normalizedSeverity.name())
                    .reason(reason)
                    .evidence(evidence)
                    .build();

        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Malformed JSON received from Hugging Face model: " + e.getMessage(), e);
        }
    }
}
