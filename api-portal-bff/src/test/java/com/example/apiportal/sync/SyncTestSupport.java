package com.example.apiportal.sync;

import java.util.function.Supplier;

final class SyncTestSupport {

    private SyncTestSupport() {
    }

    /** Source dont le résultat (ou l'échec) est fourni par le test ; compte ses appels. */
    static final class FakeSource implements CatalogSource {
        private final String environment;
        private final Supplier<CatalogSnapshot> behavior;
        private int fetchCount;

        FakeSource(String environment, Supplier<CatalogSnapshot> behavior) {
            this.environment = environment;
            this.behavior = behavior;
        }

        @Override
        public String environment() {
            return environment;
        }

        @Override
        public String label() {
            return environment.toUpperCase();
        }

        @Override
        public synchronized CatalogSnapshot fetch() {
            fetchCount++;
            return behavior.get();
        }

        synchronized int fetchCount() {
            return fetchCount;
        }
    }

    static FakeSource source(String environment, Supplier<CatalogSnapshot> behavior) {
        return new FakeSource(environment, behavior);
    }
}
