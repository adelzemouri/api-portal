package com.example.apiportal.wso2;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.ssl.SslBundles;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(Wso2Properties.class)
public class Wso2Configuration {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    Wso2ClientRegistry wso2ClientRegistry(Wso2Properties properties, RestClient.Builder restClientBuilder,
                                          SslBundles sslBundles, Clock clock) {
        return new Wso2ClientRegistry(properties, restClientBuilder, sslBundles, clock);
    }
}
