package com.example.apiportal.api;

import org.springframework.stereotype.Component;

/**
 * Point unique par lequel passent les données personnelles exposées (propriétaires d'applications,
 * subscribers). Identité pour l'instant : le filtrage par RBAC (étape 5) se branchera ici, sans toucher
 * au reste de l'API.
 */
@Component
public class PersonalDataPolicy {

    public String owner(String owner) {
        return owner;
    }

    public String subscriber(String subscriber) {
        return subscriber;
    }
}
