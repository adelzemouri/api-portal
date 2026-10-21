package com.example.apiportal.sync;

import java.time.Instant;

/**
 * Statut de synchro d'un environnement : c'est une donnée métier affichée dans l'UI, jamais un état de santé
 * du portail. {@code errorMessage} vient de {@code Wso2ClientException} (sans secret).
 */
public record SyncStatus(
        State state,
        Instant lastAttemptAt,
        Instant lastSuccessAt,
        String errorMessage,
        int apiCount,
        int applicationCount,
        int subscriptionCount) {

    public enum State { NEVER, OK, ERROR }

    public static SyncStatus never() {
        return new SyncStatus(State.NEVER, null, null, null, 0, 0, 0);
    }
}
