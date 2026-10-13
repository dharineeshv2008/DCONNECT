package com.disaster.coord.client;

import com.disaster.coord.dto.PredictionDtos.StructuredSeverityAssessment;
import com.disaster.coord.enums.DisasterType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Hugging Face Inference Client Unit Tests")
class HuggingFaceInferenceClientTest {

    private HuggingFaceInferenceClient client;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        client = new HuggingFaceInferenceClient(objectMapper);
        ReflectionTestUtils.setField(client, "baseUrl", "https://router.huggingface.co/v1");
        ReflectionTestUtils.setField(client, "hfToken", "hf_test_mock_token_1234567890abcdef");
        ReflectionTestUtils.setField(client, "modelId", "Qwen/Qwen2.5-7B-Instruct");
        ReflectionTestUtils.setField(client, "maxRetries", 1);
    }

    @Test
    @DisplayName("Should validate and normalize LOW severity response")
    void testParseLowSeverity() {
        String rawJson = "{\n"
                + "  \"id\": \"chatcmpl-123\",\n"
                + "  \"choices\": [{\n"
                + "    \"index\": 0,\n"
                + "    \"message\": {\n"
                + "      \"role\": \"assistant\",\n"
                + "      \"content\": \"{\\\"severity\\\": \\\"LOW\\\", \\\"reason\\\": \\\"Small localized kitchen fire extinguished immediately.\\\", \\\"evidence\\\": \\\"kitchen fire extinguished\\\"}\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        StructuredSeverityAssessment result = client.parseAndValidateResponse(rawJson);
        assertNotNull(result);
        assertEquals("LOW", result.getSeverity());
        assertTrue(result.getReason().contains("kitchen fire"));
        assertEquals("kitchen fire extinguished", result.getEvidence());
    }

    @Test
    @DisplayName("Should validate and normalize MEDIUM severity response")
    void testParseMediumSeverity() {
        String rawJson = "{\n"
                + "  \"choices\": [{\n"
                + "    \"message\": {\n"
                + "      \"content\": \"{\\\"severity\\\": \\\"medium\\\", \\\"reason\\\": \\\"Moderate rainfall causing localized water logging on road.\\\", \\\"evidence\\\": \\\"water logging on main road\\\"}\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        StructuredSeverityAssessment result = client.parseAndValidateResponse(rawJson);
        assertNotNull(result);
        assertEquals("MEDIUM", result.getSeverity(), "Must normalize lowercase 'medium' to uppercase 'MEDIUM'");
    }

    @Test
    @DisplayName("Should validate and normalize HIGH severity response")
    void testParseHighSeverity() {
        String rawJson = "{\n"
                + "  \"choices\": [{\n"
                + "    \"message\": {\n"
                + "      \"content\": \"{\\\"severity\\\": \\\"HIGH\\\", \\\"reason\\\": \\\"Major apartment fire with multiple hospitalizations.\\\", \\\"evidence\\\": \\\"apartment fire 15 hospitalized\\\"}\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        StructuredSeverityAssessment result = client.parseAndValidateResponse(rawJson);
        assertNotNull(result);
        assertEquals("HIGH", result.getSeverity());
    }

    @Test
    @DisplayName("Should validate and normalize CRITICAL severity response")
    void testParseCriticalSeverity() {
        String rawJson = "{\n"
                + "  \"choices\": [{\n"
                + "    \"message\": {\n"
                + "      \"content\": \"{\\\"severity\\\": \\\"CRITICAL\\\", \\\"reason\\\": \\\"Structural collapse with people trapped under debris.\\\", \\\"evidence\\\": \\\"people trapped active collapse\\\"}\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        StructuredSeverityAssessment result = client.parseAndValidateResponse(rawJson);
        assertNotNull(result);
        assertEquals("CRITICAL", result.getSeverity());
    }

    @Test
    @DisplayName("Should successfully handle model response wrapped in markdown code fence")
    void testParseResponseWrappedInMarkdown() {
        String rawJson = "{\n"
                + "  \"choices\": [{\n"
                + "    \"message\": {\n"
                + "      \"content\": \"```json\\n{\\\"severity\\\": \\\"HIGH\\\", \\\"reason\\\": \\\"Dam crest overflow warning.\\\", \\\"evidence\\\": \\\"overflow\\\"}\\n```\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        StructuredSeverityAssessment result = client.parseAndValidateResponse(rawJson);
        assertNotNull(result);
        assertEquals("HIGH", result.getSeverity());
    }

    @Test
    @DisplayName("Should reject unsupported severity value (e.g. EXTREME)")
    void testRejectUnsupportedSeverity() {
        String rawJson = "{\n"
                + "  \"choices\": [{\n"
                + "    \"message\": {\n"
                + "      \"content\": \"{\\\"severity\\\": \\\"EXTREME\\\", \\\"reason\\\": \\\"Very bad\\\", \\\"evidence\\\": \\\"fire\\\"}\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        Exception ex = assertThrows(IllegalArgumentException.class, () -> client.parseAndValidateResponse(rawJson));
        assertTrue(ex.getMessage().contains("Unsupported severity value 'EXTREME'"));
    }

    @Test
    @DisplayName("Should reject malformed JSON response")
    void testRejectMalformedJson() {
        String rawJson = "{\n"
                + "  \"choices\": [{\n"
                + "    \"message\": {\n"
                + "      \"content\": \"NOT_A_JSON_STRING\"\n"
                + "    }\n"
                + "  }]\n"
                + "}";

        assertThrows(IllegalArgumentException.class, () -> client.parseAndValidateResponse(rawJson));
    }

    @Test
    @DisplayName("Should throw IllegalStateException when HF_TOKEN is not configured")
    void testUnconfiguredTokenThrows() {
        ReflectionTestUtils.setField(client, "hfToken", "");
        assertFalse(client.isConfigured());

        Exception ex = assertThrows(IllegalStateException.class,
                () -> client.assessIncident(DisasterType.FIRE, "Title", "Desc"));
        assertTrue(ex.getMessage().contains("HF_TOKEN"));
    }

    @Test
    @DisplayName("Should safely mask token in logs and getters")
    void testMaskedTokenDoesNotExposeSecret() {
        String masked = client.getMaskedToken();
        assertTrue(masked.startsWith("hf_t"));
        assertTrue(masked.endsWith("cdef"));
        assertFalse(masked.contains("mock_token_1234567890"));
    }
}
