package com.example.apiportal.sync;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Stockage propre au portail. L'implémentation actuelle est en mémoire : le choix d'une base est une
 * question ouverte (CLAUDE.md n°2) qui ne se tranche pas ici.
 */
public interface SnapshotStore {

    void recordSuccess(String environment, CatalogSnapshot snapshot, Instant at);

    /** Conserve le dernier instantané valide : l'UI continue d'afficher les données de la dernière synchro réussie. */
    void recordFailure(String environment, String errorMessage, Instant at);

    /** Tous les environnements, dans l'ordre d'affichage. */
    List<EnvironmentState> all();

    Optional<EnvironmentState> find(String environment);
}
