package com.example.apiportal.mock;

import com.example.apiportal.sync.CatalogSnapshot;
import com.example.apiportal.sync.CatalogSource;
import com.example.apiportal.wso2.Wso2ClientException;

/** Source factice d'un environnement. Peut simuler une indisponibilité pour montrer l'état d'erreur dans l'UI. */
final class MockCatalogSource implements CatalogSource {

    private final String environment;
    private final String label;
    private final MockCatalog catalog;
    private final boolean failing;

    MockCatalogSource(String environment, String label, MockCatalog catalog, boolean failing) {
        this.environment = environment;
        this.label = label;
        this.catalog = catalog;
        this.failing = failing;
    }

    @Override
    public String environment() {
        return environment;
    }

    @Override
    public String label() {
        return label;
    }

    @Override
    public CatalogSnapshot fetch() {
        if (failing) {
            throw new Wso2ClientException(environment, "control plane unreachable (simulated)");
        }
        return catalog.snapshotFor(environment);
    }
}
