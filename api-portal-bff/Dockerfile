# Build multi-étage : JDK pour compiler, JRE seul à l'exécution (surface réduite).
#
# Base à remplacer par le miroir interne validé par la sécurité (registre bancaire) avant tout usage
# hors poste de développement ; eclipse-temurin est un défaut public raisonnable, pas une validation.
#
# Les tests tournent dans le pipeline CI, pas ici : -DskipTests évite de dupliquer l'étape et de tirer
# les dépendances de test dans l'image de build. Pas de wrapper mvnw dans ce projet : image maven dédiée.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-jammy
# wget n'est pas garanti présent sur cette base : installé explicitement pour le HEALTHCHECK, rien de plus.
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*
# Utilisateur non root : l'image ne doit jamais tourner en root en production.
RUN groupadd --system apiportal && useradd --system --gid apiportal --no-create-home apiportal
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
USER apiportal

# HTTPS et le SSL bundle group-ca sont gérés par l'application (RestClient) pour ses appels sortants vers
# WSO2 et Splunk ; ce conteneur écoute en clair sur 8080, la terminaison TLS entrante est assurée par le
# reverse proxy / l'ingress de la plateforme, jamais par ce processus.
EXPOSE 8080

# Seuls health et info sont exposés côté Actuator (contrainte du projet) : ce endpoint sert aussi de sonde
# de vivacité pour la plateforme de conteneurs.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
    CMD wget -qO- http://127.0.0.1:8080/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
