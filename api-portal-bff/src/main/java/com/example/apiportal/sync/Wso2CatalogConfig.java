package com.example.apiportal.sync;

import com.example.apiportal.wso2.Wso2ClientRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Branche les vrais control planes WSO2. Absent en profil « mock ». */
@Configuration(proxyBeanMethods = false)
@Profile("!mock")
class Wso2CatalogConfig {

    @Bean
    CatalogSources wso2CatalogSources(Wso2ClientRegistry registry) {
        return new CatalogSources(registry.all().stream()
                .<CatalogSource>map(Wso2CatalogSource::new)
                .toList());
    }
}
