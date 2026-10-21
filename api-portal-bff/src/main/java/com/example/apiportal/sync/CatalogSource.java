package com.example.apiportal.sync;

/**
 * Source de données d'un environnement : le seul point de contact entre WSO2 (ou le mock) et le reste
 * du portail. Le profil « mock » remplace l'implémentation, pas le code métier.
 */
public interface CatalogSource {

    /** Clé technique de l'environnement (dev, sim, uat, exp). */
    String environment();

    /** Libellé d'affichage (DEV, SIM, UAT, EXP). */
    String label();

    /**
     * Lit un instantané complet de l'environnement. Tout ou rien : en cas d'échec, une exception est levée
     * et aucun résultat partiel n'est retourné.
     */
    CatalogSnapshot fetch();
}
