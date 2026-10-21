package com.example.apiportal.sync;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Sources dans l'ordre d'affichage du portail (DEV, SIM, UAT, EXP). */
public record CatalogSources(List<CatalogSource> all) {

    public CatalogSources {
        all = List.copyOf(all);
        Set<String> seen = new HashSet<>();
        for (CatalogSource source : all) {
            if (!seen.add(source.environment())) {
                throw new IllegalArgumentException("Duplicate environment: " + source.environment());
            }
        }
    }
}
