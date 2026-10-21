package com.example.apiportal.metrics;

/**
 * Échec de lecture des métriques. Son message est affiché dans l'UI : il ne contient jamais de jeton, de requête
 * ni de contenu de réponse, seulement une cause générique (« Splunk unreachable », « HTTP 401 »).
 */
public class MetricsException extends RuntimeException {

    public MetricsException(String message) {
        super(message);
    }
}
