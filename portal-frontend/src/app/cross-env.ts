import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { Api, Environment } from './api.models';
import { CatalogService } from './catalog.service';
import { EnvironmentStore } from './environment.store';

/** API vues dans un environnement ; null : liste illisible (BFF en erreur), on ne conclut rien. */
export type EnvApis = Record<string, Api[] | null>;

/**
 * Index des API de tous les environnements, par nom technique : alimente le parcours (DEV → EXP) des listes et
 * « pas encore en production ». Lit uniquement le BFF ; rechargé à chaque actualisation de la liste des environnements.
 */
@Injectable({ providedIn: 'root' })
export class CrossEnvIndex {
  private readonly catalog = inject(CatalogService);
  private readonly store = inject(EnvironmentStore);

  readonly apis = signal<EnvApis>({});

  /** Nom technique → clés des environnements où une version de l'API existe. */
  readonly byName = computed(() => {
    const index = new Map<string, Set<string>>();
    for (const [env, apis] of Object.entries(this.apis())) {
      for (const api of apis ?? []) {
        (index.get(api.name) ?? index.set(api.name, new Set()).get(api.name)!).add(env);
      }
    }
    return index;
  });

  /** Vrai quand la liste de chaque environnement a été lue au moins une fois. */
  readonly ready = computed(() => {
    const apis = this.apis();
    const envs = this.store.environments();
    return envs.length > 0 && envs.every((env) => env.key in apis);
  });

  constructor() {
    effect(() => {
      const envs = this.store.environments();
      untracked(() => this.load(envs));
    });
  }

  /** Environnements (dans l'ordre DEV → EXP) où l'API est présente. */
  presence(name: string): string[] {
    const keys = this.byName().get(name);
    return this.store.environments().filter((env) => keys?.has(env.key)).map((env) => env.key);
  }

  private load(envs: Environment[]): void {
    if (envs.length === 0) {
      return;
    }
    const requests: Record<string, Observable<Api[] | null>> = {};
    for (const env of envs) {
      requests[env.key] = this.catalog.apis(env.key).pipe(catchError(() => of(null)));
    }
    forkJoin(requests)
      .subscribe((result) => this.apis.set(result));
  }
}

/** Environnement de production : le dernier dans l'ordre DEV → EXP. */
export function productionKey(envs: Environment[]): string | undefined {
  return envs.length ? [...envs].sort((a, b) => a.order - b.order)[envs.length - 1].key : undefined;
}

/**
 * URL interne d'une API : adresse de la gateway interne de l'environnement (nom contenant « int »,
 * sinon la première) suivie du contexte. Null tant qu'aucune gateway n'est connue.
 */
export function internalUrl(env: Environment | undefined, context: string): string | null {
  const gateways = env?.gateways ?? [];
  const gateway = gateways.find((g) => /int/i.test(g.name) || /(^|[-.])int([-.]|$)/i.test(g.vhost)) ?? gateways[0];
  return gateway ? gateway.url.replace(/\/+$/, '') + context : null;
}
