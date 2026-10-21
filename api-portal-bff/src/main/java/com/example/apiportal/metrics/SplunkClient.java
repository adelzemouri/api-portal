package com.example.apiportal.metrics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Exécute une recherche Splunk et renvoie ses lignes. Un compte en lecture seule suffit (rôle « search » sur les seuls
 * index d'analytique). Le point d'accès d'export répond en un seul appel, ligne JSON par résultat : pas de tâche à
 * suivre ni à supprimer côté Splunk.
 */
public class SplunkClient implements SplunkSearch {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestClient http;
    private final String token;

    public SplunkClient(RestClient http, String token) {
        this.http = http;
        this.token = token;
    }

    @Override
    public List<Map<String, String>> search(String spl, String earliest, String latest) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("search", spl);
        form.add("output_mode", "json");
        form.add("earliest_time", earliest);
        form.add("latest_time", latest);

        String body;
        try {
            body = http.post()
                    .uri("/services/search/v2/jobs/export")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            // Ni le corps (qui peut citer la requête) ni les en-têtes ne sont repris.
            throw new MetricsException("Splunk answered HTTP " + e.getStatusCode().value());
        } catch (RestClientException e) {
            throw new MetricsException("Splunk unreachable");
        }
        return parse(body);
    }

    static List<Map<String, String>> parse(String body) {
        List<Map<String, String>> rows = new ArrayList<>();
        if (body == null) {
            return rows;
        }
        for (String line : body.split("\n")) {
            if (line.isBlank()) {
                continue;
            }
            JsonNode node;
            try {
                node = JSON.readTree(line);
            } catch (JsonProcessingException e) {
                throw new MetricsException("Splunk sent an unreadable answer");
            }
            for (JsonNode message : node.path("messages")) {
                if ("FATAL".equalsIgnoreCase(message.path("type").asText())
                        || "ERROR".equalsIgnoreCase(message.path("type").asText())) {
                    throw new MetricsException("Splunk rejected the search");
                }
            }
            JsonNode result = node.get("result");
            if (result != null && result.isObject()) {
                Map<String, String> row = new LinkedHashMap<>();
                result.fields().forEachRemaining(entry -> row.put(entry.getKey(), entry.getValue().asText()));
                rows.add(row);
            }
        }
        return rows;
    }
}
