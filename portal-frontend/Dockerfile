# Build multi-étage : Node pour compiler l'Angular, nginx seul à l'exécution (fichiers statiques).
#
# Node 18 aligné sur package.json aujourd'hui (Angular 17). Rappel du README : des avis de sécurité
# *high* existent sur cette branche Angular ; ne pousser cette image que vers un registre interne / de
# démo tant que la migration (Node 20+/22 LTS, Angular supporté) n'est pas faite — voir CLAUDE.md.
#
# Base à remplacer par le miroir interne validé par la sécurité avant tout usage hors poste de développement.
FROM node:18-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build

FROM nginx:1.27-alpine
COPY --from=build /build/dist/portal-frontend/browser /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Nom et port du service BFF joignable depuis ce conteneur, substitués dans nginx.conf.template au
# démarrage (mécanisme envsubst intégré à l'image nginx officielle). À adapter au nommage réel de la
# plateforme (service mesh / DNS interne de l'environnement Virtuozzo).
ENV BFF_UPSTREAM_HOST=api-portal-bff
ENV BFF_UPSTREAM_PORT=8080

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
