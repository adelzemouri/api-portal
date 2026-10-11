package com.example.apiportal.wso2;

/**
 * Erreur d'accès à un environnement WSO2. Le message est toujours préfixé par l'environnement
 * et ne contient jamais de secret : il peut finir dans les logs et dans le statut de synchro.
 */
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
