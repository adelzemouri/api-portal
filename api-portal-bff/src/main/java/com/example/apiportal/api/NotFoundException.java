package com.example.apiportal.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/** 404 sans message dans la réponse (server.error.include-message=never). */
@ResponseStatus(HttpStatus.NOT_FOUND)
class NotFoundException extends RuntimeException {

    NotFoundException(String message) {
        super(message);
    }
}
