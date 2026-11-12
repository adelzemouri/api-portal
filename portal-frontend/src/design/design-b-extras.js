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
 *     sobre : plus d'accroche, de numéros géants, de halos ni de boutons orange ;
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
    header, .ch-num { display: none; }
    h2, h3, .stat b, .kpi, .verdict .big, .chap-nav a, .motion-control, .seg button, .scen button { font-family: inherit !important; }
    .chap-nav { position: static; margin: 0; padding: 0 0 10px; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-bottom: 1px solid var(--border); }
    .chap-nav ol { max-width: none; gap: 20px; }
    .chap-nav a, .chap-nav a.on { padding: 4px 0; gap: 6px; border-radius: 0; font-size: 13px; font-weight: 450; background: none; box-shadow: none; }
    .chap-nav a.on { color: var(--fg); }
    .chap-nav a span, .chap-nav a.on span { width: auto; height: auto; background: none; color: var(--muted); font-family: var(--mono); font-size: 12px; }

    /* Un chapitre = un texte à gauche, sa figure à droite : la scène n'occupe plus toute la largeur */
    .chapter { display: grid; grid-template-columns: minmax(200px, 250px) minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 0; padding: 24px 0; border-bottom: 1px solid var(--border); scroll-margin-top: 80px; }
    .chapter:last-child { padding-bottom: 0; border-bottom: 0; }
    .ch-head { display: block; margin: 0; }
    .ch-head h2 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font-size: 15px; font-weight: 500; line-height: 1.35; letter-spacing: -0.01em; }
    .ch-head h2[data-title] { font-size: 0; }
    .ch-head h2[data-title]::before { content: attr(data-num); font: 400 12px/1.35 var(--mono); color: var(--muted); }
    .ch-head h2[data-title]::after { content: attr(data-title); font-size: 15px; }
    .ch-head p { max-width: none; font-size: 13px; line-height: 1.55; }
    @media (max-width: 900px) { .chapter { grid-template-columns: minmax(0, 1fr); gap: 14px; } }

    /* Scène : une figure posée sur la surface de l'app, plus de bloc noir */
    .stage { max-width: 780px; border-radius: 9px; color: var(--st-fg); background: var(--st-bg); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .stage svg { min-width: 560px; }
    .stage-bar { padding: 12px 14px 0; gap: 10px; }
    .stage-bar .seg { position: relative; left: auto; transform: none; }
    .stat { flex: 1 1 220px; }
    .stat span { max-width: 34ch; }
    .motion-host { padding: 12px 14px 0; }
    .chips-legend { padding: 0 14px 12px; }
    .chips-legend span { font-size: 12px; }
    .live { gap: 10px; padding: 0 14px 14px; }
    svg [stroke="rgba(200,205,212,0.2)"] { stroke: var(--st-line); }
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
    .console { height: 170px; border-radius: 7px; font-size: 12px; background: var(--st-node); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .console::before { content: none; }
    .console .out { color: var(--st-fg); } .console .in { color: var(--st-muted); } .console .note { color: var(--st-or); }
    .verdict, .card-app { min-height: 0; border-radius: 7px; background: var(--st-node); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .verdict { min-height: 170px; }
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
    /* Titre de chapitre = libellé de son lien dans la navigation du guide, pour qu'ils disent la même chose */
    for (const link of shadow.querySelectorAll('.chap-nav a[href^="#"]')) {
      const heading = shadow.querySelector(`${link.getAttribute('href')} .ch-head h2`);
      if (!heading) continue;
      const num = link.querySelector('span');
      const title = [...link.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (on && title) {
        if (heading.getAttribute('data-title') !== title) heading.setAttribute('data-title', title);
        if (num && heading.getAttribute('data-num') !== num.textContent.trim()) heading.setAttribute('data-num', num.textContent.trim());
      } else { heading.removeAttribute('data-title'); heading.removeAttribute('data-num'); }
    }
  }

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'aria-label' || !r.target.matches('button.copy') || r.oldValue === null) continue;
      if (!restLabel.has(r.target)) restLabel.set(r.target, r.oldValue);
      r.target.toggleAttribute('data-copied', r.target.getAttribute('aria-label') !== restLabel.get(r.target));
    }
    schedule();
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-label', 'data-design', 'class', 'aria-pressed'] });
})();
