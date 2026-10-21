package com.example.apiportal.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class VersionComparatorTest {

    @Test
    @DisplayName("l'ordre est numérique par segment : 1.2 < 1.10 < 2.0")
    void ordersNumerically() {
        List<String> sorted = List.of("2.0", "1.10", "1.2", "1.2.1", "0.9").stream()
                .sorted(VersionComparator.INSTANCE).toList();

        assertThat(sorted).containsExactly("0.9", "1.2", "1.2.1", "1.10", "2.0");
    }

    @Test
    @DisplayName("des versions non numériques ne provoquent pas d'erreur")
    void toleratesNonNumericVersions() {
        assertThat(VersionComparator.INSTANCE.compare("1.0-beta", "1.0-rc")).isNegative();
        assertThat(VersionComparator.INSTANCE.compare("1.0", "1.0")).isZero();
        assertThat(VersionComparator.INSTANCE.compare("", "1.0")).isNotZero();
    }
}
