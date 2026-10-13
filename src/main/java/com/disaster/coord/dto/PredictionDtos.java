package com.disaster.coord.dto;

import com.disaster.coord.enums.DisasterType;
import com.disaster.coord.enums.Severity;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class PredictionDtos {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PredictionRequest {
        private String description;
        private DisasterType type;
        private String title;
        private Long disasterId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PredictionResponse {
        private String severity;
        private Double confidence;
        private String reason;
        private String evidence;
        private String status; // SUCCESS, PENDING, FAILED
        private String modelId;
        private String source;
        private String errorMessage;

        public static PredictionResponse fallback(String defaultSeverity, String reason, String errorMsg) {
            return PredictionResponse.builder()
                    .severity(defaultSeverity != null ? defaultSeverity : Severity.MEDIUM.name())
                    .confidence(0.70)
                    .reason(reason)
                    .evidence("Fallback default - external assessment unavailable")
                    .status("FAILED")
                    .source("rule_engine_fallback")
                    .errorMessage(errorMsg)
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class StructuredSeverityAssessment {
        private String severity;
        private String reason;
        private String evidence;
    }

    // OpenAI-compatible Chat Completions schema for Hugging Face Router
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class HfChatCompletionRequest {
        private String model;
        private List<HfChatMessage> messages;
        private Double temperature;
        @JsonProperty("max_tokens")
        private Integer maxTokens;
        @JsonProperty("response_format")
        private Map<String, Object> responseFormat;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HfChatMessage {
        private String role;
        private String content;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class HfChatCompletionResponse {
        private String id;
        private String model;
        private List<HfChoice> choices;
        private HfError error;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class HfChoice {
        private Integer index;
        private HfChatMessage message;
        @JsonProperty("finish_reason")
        private String finishReason;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class HfError {
        private String message;
        private String type;
        private String code;
    }
}
