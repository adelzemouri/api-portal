package com.example.apiportal.wso2;

/** Erreur d'accès à un control plane, toujours rattachée à son environnement. */
public class Wso2ClientException extends RuntimeException {

    private final String environment;

    public Wso2ClientException(String environment, String message) {
        super("[" + environment + "] " + message);
        this.environment = environment;
    }

    public Wso2ClientException(String environment, String message, Throwable cause) {
        super("[" + environment + "] " + message, cause);
        this.environment = environment;
    }

    public String environment() {
        return environment;
    }
}
