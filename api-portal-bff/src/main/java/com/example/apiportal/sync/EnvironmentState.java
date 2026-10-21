package com.example.apiportal.sync;

/** Dernier instantané valide d'un environnement et statut de la dernière tentative de synchro. */
public record EnvironmentState(String key, String label, SyncStatus status, CatalogSnapshot snapshot) {
}
