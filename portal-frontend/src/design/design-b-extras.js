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
    .wrap { max-width: none; padding-block: 0 4px; }
    header { display: none; }
    h2, h3, .stat b, .kpi, .verdict .big, .chap-nav a, .motion-control, .seg button, .scen button { font-family: inherit !important; }
    .chap-nav { position: static; margin: 0; padding: 0 0 10px; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-bottom: 1px solid var(--border); }
    .chap-nav ol { max-width: none; gap: 20px; }
    .chap-nav a, .chap-nav a.on { padding: 4px 0; gap: 6px; border-radius: 0; font-size: 13px; font-weight: 450; background: none; box-shadow: none; }
    .chap-nav a.on { color: var(--fg); }
    .chap-nav a span, .chap-nav a.on span { width: auto; height: auto; background: none; color: var(--muted); font-family: var(--mono); font-size: 12px; }
    .chapter { margin-top: 32px; scroll-margin-top: 80px; }
    .ch-head { grid-template-columns: minmax(0, 1fr); gap: 4px; margin-bottom: 14px; }
    .ch-num { grid-row: auto; font: 400 12px/1.4 var(--mono); letter-spacing: 0; color: var(--muted); -webkit-text-stroke: 0; }
    .ch-head h2 { font-size: 16px; font-weight: 500; line-height: 1.35; letter-spacing: -0.01em; }
    .ch-head p { max-width: 80ch; font-size: 14px; }
    .stage { border-radius: 10px; background: var(--st-bg); box-shadow: 0 0 0 1px var(--st-ring) inset; }
    .motion-control, .motion-control[data-playing="true"] { min-height: 30px; padding: 6px 12px; border-radius: 7px; font-size: 12.5px; font-weight: 500; color: var(--st-fg); background: rgba(255,255,255,.07); box-shadow: 0 0 0 1px rgba(255,255,255,.14) inset; }
    .motion-control::before { width: auto; height: auto; background: none; }
    .motion-control:hover { transform: none; background: rgba(255,255,255,.11); }
    .seg, .seg button, .seg i { border-radius: 8px; }
    .seg button { padding: 6px 14px; font-size: 13px; font-weight: 500; }
    .seg i, .seg i.off { background: rgba(255,255,255,.14); box-shadow: none; transition-duration: .2s; }
    .stat b { font-size: 26px; font-weight: 500; letter-spacing: -0.02em; }
    .scen button { border-radius: 7px; font-size: 13px; font-weight: 500; }
    .scen button[aria-pressed="true"] { background: rgba(255,255,255,.1); box-shadow: 0 0 0 1px rgba(255,255,255,.32) inset; }
    .console, .verdict, .card-app { border-radius: 8px; }
    .verdict .big { font-size: 20px; font-weight: 600; letter-spacing: 0; }
    .verdict h3 { font-size: 14px; font-weight: 500; }
    .cons .side .kpi { font-size: 26px; font-weight: 500; letter-spacing: -0.02em; }
    .flash, .flash-err { animation: none; }
    .pk-halo { display: none; }
    .fade-in, .console div { animation-duration: .15s; }
  `;
  let guideSheet = null;
  function guide(on) {
    const host = document.querySelector('.understand-wso2-native');
    const shadow = host && host.shadowRoot;
    if (!shadow || !('adoptedStyleSheets' in shadow)) return;
    if (!guideSheet) { guideSheet = new CSSStyleSheet(); guideSheet.replaceSync(GUIDE_CSS); }
    const has = shadow.adoptedStyleSheets.includes(guideSheet);
    if (on && !has) shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, guideSheet];
    if (!on && has) shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((x) => x !== guideSheet);
  }

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'aria-label' || !r.target.matches('button.copy') || r.oldValue === null) continue;
      if (!restLabel.has(r.target)) restLabel.set(r.target, r.oldValue);
      r.target.toggleAttribute('data-copied', r.target.getAttribute('aria-label') !== restLabel.get(r.target));
    }
    if (!queued) { queued = true; requestAnimationFrame(mirrorEta); }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-label', 'data-design', 'class', 'aria-pressed'] });
})();
