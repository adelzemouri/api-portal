/*
 * Retouches du design B (Graphite Premium) qui touchent à la structure et non au style.
 *
 * Elles sont faites ici pour pouvoir juger du résultat sans modifier l'application ; à
 * l'intégration définitive, les reporter dans les templates Angular et supprimer ce fichier :
 *   - le compte à rebours « next sync » quitte la barre de navigation et s'affiche dans
 *     l'en-tête de colonne « Sync » du tableau « Environment health » ;
 *   - les titres de page deviennent factuels : nom de la rubrique (libellé de navigation actif)
 *     et environnement courant, exposés en data-title / data-env sur le <h2> ;
 *   - le guide « Comprendre WSO2 » de la page d'aide (Shadow DOM) reçoit une feuille de style
 *     sobre et chaque diagramme devient une tuile titrée comme les autres sections ;
 *   - un bouton Copier dont le libellé a changé (copie réussie) est marqué data-copied,
 *     quelle que soit la langue, pour que le pictogramme passe à la coche.
 * Isolé : aucun import, aucun appel réseau, aucun événement applicatif intercepté.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const restLabel = new WeakMap();
  let queued = false;

  function mirrorEta() {
    queued = false;
    const on = root.getAttribute('data-design') === 'b';
    titles(on); guide(on);
    const source = document.querySelector('.sidebar-sync-eta');
    const head = document.querySelector('.env-compare-table thead th:nth-child(2)');
    let mirror = document.querySelector('.sync-eta-mirror');
    if (!on || !source || !head) { if (mirror) mirror.remove(); return; }
    if (!mirror || mirror.parentNode !== head) {
      if (mirror) mirror.remove();
      mirror = document.createElement('span');
      mirror.className = 'sync-eta-mirror';
      head.appendChild(mirror);
    }
    const text = source.textContent.replace(/\s+/g, ' ').trim();
    if (mirror.textContent !== text) mirror.textContent = text;
    if (source.title && mirror.title !== source.title) mirror.title = source.title;
  }

  function titles(on) {
    const label = document.querySelector('.sidebar nav .active span');
    const env = document.querySelector('.env-switch button[aria-pressed="true"]');
    for (const h of document.querySelectorAll('main .page-head h2')) {
      const title = on && label ? label.textContent.trim() : '';
      const tag = on && env && !h.closest('.help-page-head') ? env.textContent.trim() : '';
      if (title) { if (h.getAttribute('data-title') !== title) h.setAttribute('data-title', title); } else h.removeAttribute('data-title');
      if (tag) { if (h.getAttribute('data-env') !== tag) h.setAttribute('data-env', tag); } else h.removeAttribute('data-env');
    }
  }

  /* Guide de l'aide : documentation interne, pas une page d'atterrissage. La scène reste sombre dans les deux thèmes. */
  const GUIDE_CSS = `
    .native-guide-body { padding: 0; background: transparent; font: inherit; font-size: 14px; line-height: 1.55; }
    .wrap { max-width: none; padding-block: 0; }
    header, .ch-num, .chap-nav { display: none; }
    h2, h3, .stat b, .kpi, .verdict .big, .chap-nav a, .motion-control, .seg button, .scen button { font-family: inherit !important; }
    .chap-nav { position: static; margin: 0; padding: 0 0 10px; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-bottom: 1px solid var(--border); }
    .chap-nav ol { max-width: none; gap: 20px; }
    .chap-nav a, .chap-nav a.on { padding: 4px 0; gap: 6px; border-radius: 0; font-size: 13px; font-weight: 450; background: none; box-shadow: none; }
    .chap-nav a.on { color: var(--fg); }
    .chap-nav a span, .chap-nav a.on span { width: auto; height: auto; background: none; color: var(--muted); font-family: var(--mono); font-size: 12px; }

    /* Un chapitre = un texte à gauche, sa figure à droite : la scène n'occupe plus toute la largeur */
    /* Chaque diagramme est une tuile comme les autres sections de l'aide : sur-titre, titre, contenu */
    .chapter { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 28px; align-items: start; margin: 0 0 var(--ds-gap); padding: var(--ds-panel-pad);
      background: var(--ds-panel-bg, var(--ds-surface)); border: var(--ds-panel-border); border-radius: var(--ds-r-lg); box-shadow: var(--ds-panel-shadow, none); scroll-margin-top: 80px; }
    .ch-head { display: block; margin: 0; }
    .ch-head h2 { margin: 0 0 10px; font-size: var(--ds-fs-h2); font-weight: var(--ds-fw-strong); line-height: 1.35; letter-spacing: -0.01em; color: var(--ds-text); }
    .ch-head h2[data-title] { font-size: 0; }
    .ch-head h2[data-title]::before { content: attr(data-kicker); display: block; margin-bottom: 2px; font: 400 var(--ds-label-size)/1.4 var(--ds-font-mono); letter-spacing: 0; color: var(--ds-text-3); }
    .ch-head h2[data-title]::after { content: attr(data-title); font-size: var(--ds-fs-h2); }
    .ch-head p { max-width: none; font-size: 13px; line-height: 1.55; }
    @media (max-width: 900px) { .chapter { grid-template-columns: minmax(0, 1fr); gap: 14px; } }

    /* Scène : une figure posée sur la surface de l'app, plus de bloc noir */
    .stage { max-width: 780px; border-radius: 9px; color: var(--st-fg); background: var(--st-bg); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    /* Pas de largeur minimale : le schéma se réduit avec sa colonne au lieu de faire défiler */
    .stage svg { min-width: 0 !important; }
    .stage-scroll { overflow: hidden; }
    .stage-bar { padding: 12px 14px 0; gap: 10px; }
    .stage-bar .seg { position: relative; left: auto; transform: none; }
    .stat { flex: 1 1 220px; }
    .stat span { max-width: 34ch; }
    /* « 1 » suivi de « one … » : le chiffre répète le premier mot, on ne garde que la phrase */
    .stage-bar:has(#c1on[aria-pressed="true"]) .stat b { display: none; }
    .stage-bar:has(#c1on[aria-pressed="true"]) .stat span { max-width: 44ch; font-size: 13px; color: var(--st-fg); }
    .stage-bar:has(#c1on[aria-pressed="true"]) .stat span::first-letter { text-transform: uppercase; }
    .motion-host { padding: 12px 14px 0; }
    .chips-legend { padding: 0 14px 12px; }
    .chips-legend span { font-size: 12px; }
    .live { gap: 10px; padding: 0 14px 14px; }
    svg [stroke="rgba(200,205,212,0.2)"] { stroke: color-mix(in srgb, var(--st-fg) 24%, transparent); }
    svg [style*="rgb(207, 212, 218)"] { fill: var(--st-muted) !important; }
    .nd { stroke-width: 1; }
    .nd-or, .app-node.sel rect { fill: color-mix(in srgb, var(--st-or) 12%, var(--st-node)); }
    .pill-chk rect { fill: var(--st-node); }
    .tt { font-weight: 500; }
    .motion-control, .motion-control[data-playing="true"] { min-height: 28px; padding: 5px 10px; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--st-fg); background: var(--st-node); box-shadow: 0 0 0 1px var(--st-line) inset; }
    .motion-control::before { width: auto; height: auto; background: none; }
    .motion-control:hover { transform: none; background: color-mix(in srgb, var(--st-fg) 6%, var(--st-node)); }
    .seg { padding: 3px; border-radius: 8px; background: color-mix(in srgb, var(--st-fg) 6%, transparent); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .seg button { padding: 5px 12px; border-radius: 6px; font-size: 12.5px; font-weight: 500; }
    .seg button[aria-pressed="true"] { color: var(--st-fg); }
    .seg i, .seg i.off { top: 3px; bottom: 3px; left: 3px; border-radius: 6px; background: var(--st-node); box-shadow: 0 0 0 1px var(--st-line) inset; transition-duration: .2s; }
    .stat { min-height: 0; gap: 8px; }
    .stat b { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; color: var(--st-fg); }
    .stat span { font-size: 12.5px; }
    .scen { gap: 6px; }
    .scen button { padding: 5px 10px; border-radius: 7px; font-size: 12.5px; font-weight: 500; background: var(--st-node); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .scen button:hover { background: color-mix(in srgb, var(--st-fg) 5%, var(--st-node)); }
    .scen button[aria-pressed="true"] { background: var(--st-node); box-shadow: 0 0 0 1px var(--st-fg) inset; }
    .scen .code { background: color-mix(in srgb, var(--st-fg) 8%, transparent); }
    /* Hauteurs fixes : la scène ne doit pas grandir ni rétrécir pendant qu'elle joue */
    .stage-bar { min-height: 60px; }
    .console, .verdict { height: 214px; min-height: 0; overflow: hidden; }
    .console { border-radius: 7px; font-size: 12px; background: var(--st-node); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .console::before { content: none; }
    .console .out { color: var(--st-fg); } .console .in { color: var(--st-muted); } .console .note { color: var(--st-or); }
    .verdict, .card-app { min-height: 0; border-radius: 7px; background: var(--st-node); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .verdict .big { font-size: 18px; font-weight: 600; letter-spacing: 0; }
    .verdict h3 { font-size: 14px; font-weight: 500; }
    .verdict p { font-size: 13px; color: var(--st-muted); }
    .verdict .fix { color: var(--st-or); }
    .cons .side { padding: 16px; border-left-color: var(--st-ring); }
    .cons .side .kpi { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; }
    .card-app .nm { font-size: 14px; font-weight: 500; }
    .b-ok { background: color-mix(in srgb, var(--st-ok) 14%, transparent); }

    /* Animations : des points nets qui suivent leur trajet, sans halo, sans flash ni rebond */
    .flash, .flash-err { animation: none; }
    .pk-halo { display: none; }
    .fade-in, .console div { animation-duration: .15s; }
  `;
  /* Textes à reporter dans les fichiers de traduction du front à l'intégration */
  const GUIDE_TITLES = {
    c1: { en: ['Platform', 'Role of the API gateway'], fr: ['Plateforme', 'Rôle de la gateway API'] },
    c3: { en: ['Runtime', 'Anatomy of an API call'], fr: ['Exécution', 'Déroulé d’un appel d’API'] },
    c5: { en: ['Consumers', 'Applications subscribed to an API'], fr: ['Consommateurs', 'Applications abonnées à une API'] },
  };
  let guideSheet = null;
  const watched = new WeakSet();
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(mirrorEta); } };
  function guide(on) {
    const host = document.querySelector('.understand-wso2-native');
    const shadow = host && host.shadowRoot;
    if (!shadow || !('adoptedStyleSheets' in shadow)) return;
    if (!guideSheet) { guideSheet = new CSSStyleSheet(); guideSheet.replaceSync(GUIDE_CSS); }
    const has = shadow.adoptedStyleSheets.includes(guideSheet);
    if (on && !has) shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, guideSheet];
    if (!on && has) shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((x) => x !== guideSheet);
    /* Le guide se redessine au changement de langue : on le suit pour reposer les titres */
    if (!watched.has(shadow)) { watched.add(shadow); new MutationObserver(schedule).observe(shadow, { subtree: true, childList: true }); }
    /* Sur-titre et titre de chaque diagramme, au même format que les autres tuiles (« Reference / Environments ») */
    /* Langue courante : le choix mémorisé par l'application, sinon le libellé du champ de recherche */
    let stored = null;
    try { stored = localStorage.getItem('api-portal-language'); } catch { /* stockage indisponible */ }
    const trigger = document.querySelector('.search-trigger');
    const lang = (stored || (trigger && /^\s*recherch/i.test(trigger.textContent) ? 'fr' : 'en')).toLowerCase().startsWith('fr') ? 'fr' : 'en';
    for (const [id, text] of Object.entries(GUIDE_TITLES)) {
      const heading = shadow.querySelector(`#${id} .ch-head h2`);
      if (!heading) continue;
      const [kicker, title] = on ? text[lang] : ['', ''];
      for (const [name, value] of [['data-kicker', kicker], ['data-title', title]]) {
        if (!value) heading.removeAttribute(name); else if (heading.getAttribute(name) !== value) heading.setAttribute(name, value);
      }
    }
  }

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'aria-label' || !r.target.matches('button.copy') || r.oldValue === null) continue;
      if (!restLabel.has(r.target)) restLabel.set(r.target, r.oldValue);
      r.target.toggleAttribute('data-copied', r.target.getAttribute('aria-label') !== restLabel.get(r.target));
    }
    schedule();
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-label', 'data-design', 'class', 'aria-pressed', 'lang'] });
})();
