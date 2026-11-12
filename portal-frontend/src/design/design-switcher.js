/*
 * Sélecteur de design — outil TEMPORAIRE de comparaison des quatre directions graphiques.
 *
 * Totalement isolé de l'application : aucun import, aucune dépendance, aucun appel réseau.
 * Il ne fait que poser l'attribut data-design sur <html> ; tout le reste est du CSS.
 * Son interface vit dans un Shadow DOM : ni ses styles ni ceux de l'application ne se croisent.
 *
 * Suppression après le choix définitif : voir design/README.md (retirer ce fichier, fixer
 * data-design dans index.html, supprimer les blocs de tokens des trois autres directions).
 */
(() => {
  'use strict';

  /* Configuration centralisée des thèmes. `null` = interface d'origine, gardée comme point de repère. */
  const DESIGNS = [
    { id: 'a', name: 'Executive Corporate', note: 'Encre marine, filets nets, dense' },
    { id: 'b', name: 'Graphite Premium', note: 'Nuit graphite, jour papier chaud, léger relief' },
    { id: 'c', name: 'Minimalist Luxury', note: 'Ivoire, serif, filets fins, sans boîtes' },
    { id: 'd', name: 'Contemporary Enterprise', note: 'Bandeau pétrole, navigation horizontale' },
  ];
  const ORIGINAL = { id: 'o', name: 'Interface d’origine', note: 'Avant refonte, pour référence' };
  const STORAGE_KEY = 'api-portal-design';
  const DEFAULT_ID = 'a';
  const root = document.documentElement;

  /* Dans une vignette du mode comparaison, le design est imposé par le nom de la fenêtre. */
  const forced = /^apd-preview-([a-do])$/.exec(window.name || '');
  const isPreview = Boolean(forced);

  /* 'e' : ancien identifiant de Graphite, fusionné dans B. */
  const read = () => { try { const v = localStorage.getItem(STORAGE_KEY); return v === 'e' ? 'b' : v; } catch { return null; } };
  const write = (id) => { try { localStorage.setItem(STORAGE_KEY, id); } catch { /* stockage indisponible : choix non mémorisé */ } };
  const known = (id) => id === ORIGINAL.id || DESIGNS.some((d) => d.id === id);
  const byId = (id) => (id === ORIGINAL.id ? ORIGINAL : DESIGNS.find((d) => d.id === id));

  /* Sélection des versions à comparer côte à côte (au moins deux), mémorisée elle aussi. */
  const COMPARE_KEY = 'api-portal-design-compare';
  const ALL = [...DESIGNS, ORIGINAL];
  let compareIds = (() => {
    try { const ids = JSON.parse(localStorage.getItem(COMPARE_KEY) || 'null'); if (Array.isArray(ids)) return ids.filter(known); } catch { /* valeur illisible : sélection par défaut */ }
    return DESIGNS.map((d) => d.id);
  })();
  const toggleCompare = (id) => {
    compareIds = compareIds.includes(id) ? compareIds.filter((x) => x !== id) : ALL.map((d) => d.id).filter((x) => x === id || compareIds.includes(x));
    try { localStorage.setItem(COMPARE_KEY, JSON.stringify(compareIds)); } catch { /* non mémorisé */ }
  };

  let current = forced ? forced[1] : (known(read()) ? read() : DEFAULT_ID);

  function apply(id, persist) {
    current = id;
    if (id === ORIGINAL.id) root.removeAttribute('data-design');
    else root.setAttribute('data-design', id);
    if (persist && !isPreview) write(id);
    render();
  }

  /* Appliqué tout de suite, avant le premier rendu, pour éviter un flash de l'ancien style. */
  if (current === ORIGINAL.id) root.removeAttribute('data-design');
  else root.setAttribute('data-design', current);
  if (isPreview) return;

  /* ---------- Interface ---------- */
  let host, shadow, open = false, comparing = false, hidden = false;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; font: 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #f3f3f1; }
    .wrap[hidden] { display: none; }
    button { font: inherit; color: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid #9db8ff; outline-offset: 2px; }
    .pill { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px 0 6px; background: #1a1b1e; border: 1px solid #3a3c41; border-radius: 4px; box-shadow: 0 4px 14px rgb(0 0 0 / 22%); }
    .pill:hover { background: #232529; }
    .key { display: inline-grid; place-items: center; width: 18px; height: 18px; font-weight: 600; font-size: 11px; color: #1a1b1e; background: #f3f3f1; border-radius: 2px; }
    .caret { margin-left: 2px; opacity: 0.6; font-size: 9px; }
    .panel { position: absolute; right: 0; bottom: 38px; width: 320px; padding: 6px; background: #1a1b1e; border: 1px solid #3a3c41; border-radius: 4px; box-shadow: 0 12px 32px rgb(0 0 0 / 32%); }
    .title { display: flex; justify-content: space-between; padding: 6px 8px 8px; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #9a9da4; }
    .optrow { display: grid; grid-template-columns: 1fr 26px; align-items: center; gap: 4px; }
    .tick { width: 18px; height: 18px; padding: 0; margin: 0 4px; font-size: 11px; line-height: 1; color: #1a1b1e; background: transparent; border: 1px solid #5a5d63; border-radius: 3px; }
    .tick[aria-pressed="true"] { background: #f3f3f1; border-color: #f3f3f1; }
    .row button:disabled { opacity: 0.45; cursor: not-allowed; }
    .opt { display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; text-align: left; background: transparent; border: 0; border-radius: 3px; }
    .opt:hover { background: #26282c; }
    .opt[aria-checked="true"] { background: #2c2f34; }
    .opt .key { background: #3a3c41; color: #f3f3f1; }
    .opt[aria-checked="true"] .key { background: #f3f3f1; color: #1a1b1e; }
    .opt b { display: block; font-weight: 600; }
    .opt small { display: block; font-size: 11px; color: #9a9da4; }
    .opt kbd { font: 10px ui-monospace, Consolas, monospace; color: #9a9da4; }
    .sep { height: 1px; margin: 6px 0; background: #303236; }
    .row { display: flex; gap: 6px; padding: 2px; }
    .row button { flex: 1; height: 28px; background: #26282c; border: 1px solid #3a3c41; border-radius: 3px; }
    .row button:hover { background: #303236; }
    .cmp { position: fixed; inset: 0; z-index: 2147483001; display: grid; grid-template-rows: 40px 1fr; background: #0f1012; font: 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #f3f3f1; }
    .cmp-bar { display: flex; align-items: center; gap: 12px; padding: 0 12px; border-bottom: 1px solid #303236; }
    .cmp-bar span { color: #9a9da4; }
    .cmp-bar .chips { display: flex; gap: 4px; }
    .cmp-bar .hint { margin-left: auto; }
    .cmp-bar .chip { width: 26px; padding: 0; font-weight: 600; color: #9a9da4; background: transparent; }
    .cmp-bar .chip[aria-pressed="true"] { color: #1a1b1e; background: #f3f3f1; border-color: #f3f3f1; }
    .cmp-bar button { height: 26px; padding: 0 10px; background: #26282c; border: 1px solid #3a3c41; border-radius: 3px; }
    .grid { display: grid; gap: 1px; background: #303236; min-height: 0; }
    .cell { position: relative; overflow: hidden; background: #fff; }
    .cell iframe { position: absolute; top: 28px; left: 0; border: 0; transform-origin: 0 0; }
    .cell header { position: absolute; inset: 0 0 auto 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; height: 28px; padding: 0 8px; background: #1a1b1e; }
    .cell header b { font-weight: 600; }
    .cell header button { height: 20px; padding: 0 8px; font-size: 11px; background: #f3f3f1; color: #1a1b1e; border: 0; border-radius: 2px; }
  `;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = (d) => (d.id === ORIGINAL.id ? '0' : d.id.toUpperCase());

  function render() {
    if (!shadow) return;
    const d = byId(current);
    const option = (x, i) => `
      <div class="optrow">
        <button class="opt" role="menuitemradio" aria-checked="${x.id === current}" data-id="${x.id}" title="Alt+${i}">
          <span class="key">${label(x)}</span>
          <span><b>${esc(x.name)}</b><small>${esc(x.note)}</small></span>
        </button>
        <button class="tick" data-act="toggle-compare" data-cmp="${x.id}" aria-pressed="${compareIds.includes(x.id)}" aria-label="Inclure ${esc(x.name)} dans la comparaison" title="Inclure dans la comparaison">${compareIds.includes(x.id) ? '✓' : ''}</button>
      </div>`;
    const shown = ALL.filter((x) => compareIds.includes(x.id));
    const cols = shown.length <= 2 ? shown.length : shown.length <= 4 ? 2 : 3;
    const panel = !open ? '' : `
      <div class="panel" role="menu" aria-label="Choisir un design">
        <div class="title"><span>Direction graphique</span><span>comparer</span></div>
        ${DESIGNS.map((x, i) => option(x, i + 1)).join('')}
        <div class="sep"></div>
        ${option(ORIGINAL, 0)}
        <div class="sep"></div>
        <div class="row">
          <button data-act="compare" ${compareIds.length < 2 ? 'disabled' : ''} title="Cochez au moins deux versions">Comparer (${compareIds.length})</button>
          <button data-act="hide" title="Réafficher : Alt+H">Masquer</button>
        </div>
      </div>`;
    const compare = !comparing ? '' : `
      <div class="cmp" role="dialog" aria-label="Comparaison des designs">
        <div class="cmp-bar">
          <span>Versions affichées</span>
          <div class="chips">${ALL.map((x) => `<button class="chip" data-act="toggle-compare" data-cmp="${x.id}" aria-pressed="${compareIds.includes(x.id)}" title="${esc(x.name)}">${label(x)}</button>`).join('')}</div>
          <span class="hint">Chaque vignette est l'application réelle : on peut y naviguer.</span>
          <button data-act="close-compare">Fermer (Échap)</button>
        </div>
        <div class="grid" style="grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${Math.ceil(shown.length / cols)}, 1fr)">
          ${shown.map((x) => `<div class="cell"><header><span><b>${label(x)}</b> · ${esc(x.name)}</span><button data-id="${x.id}" data-act="pick">Utiliser ce design</button></header><iframe name="apd-preview-${x.id}" src="${esc(location.href)}" title="${esc(x.name)}"></iframe></div>`).join('')}
        </div>
      </div>`;
    shadow.innerHTML = `<style>${CSS}</style>
      <div class="wrap" ${hidden ? 'hidden' : ''}>
        ${panel}
        <button class="pill" aria-haspopup="menu" aria-expanded="${open}" title="Changer de design (Alt+1 à Alt+4)">
          <span class="key">${label(d)}</span><span>${esc(d.name)}</span><span class="caret">▲</span>
        </button>
      </div>${compare}`;
    fit();
  }

  /* Chaque vignette rend l'application à 1440 px de large, puis est réduite à la largeur de sa case. */
  function fit() {
    if (!shadow || !comparing) return;
    shadow.querySelectorAll('.cell').forEach((cell) => {
      const frame = cell.querySelector('iframe');
      const k = Math.min(1, cell.clientWidth / 1440);
      frame.style.width = `${cell.clientWidth / k}px`;
      frame.style.height = `${(cell.clientHeight - 28) / k}px`;
      frame.style.transform = `scale(${k})`;
    });
  }

  function onClick(event) {
    const target = event.target.closest('button');
    if (!target) return;
    const act = target.dataset.act;
    if (target.classList.contains('pill')) { open = !open; render(); return; }
    if (act === 'toggle-compare') {
      const id = target.dataset.cmp;
      if (comparing && compareIds.includes(id) && compareIds.length <= 2) return; /* jamais moins de deux vignettes */
      toggleCompare(id); render(); return;
    }
    if (act === 'compare') { if (compareIds.length < 2) return; open = false; comparing = true; render(); return; }
    if (act === 'close-compare') { comparing = false; render(); return; }
    if (act === 'hide') { open = false; hidden = true; render(); return; }
    if (act === 'pick') { comparing = false; apply(target.dataset.id, true); return; }
    if (target.dataset.id) { open = false; apply(target.dataset.id, true); }
  }

  function onKey(event) {
    if (event.key === 'Escape' && (open || comparing)) { open = false; comparing = false; render(); return; }
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const n = event.code && /^Digit([0-4])$/.exec(event.code);
    if (n) { event.preventDefault(); apply(n[1] === '0' ? ORIGINAL.id : DESIGNS[Number(n[1]) - 1].id, true); return; }
    if (event.code === 'KeyH') { event.preventDefault(); hidden = !hidden; open = false; render(); }
  }

  function mount() {
    host = document.createElement('div');
    host.id = 'design-switcher';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit);
    document.addEventListener('click', (event) => { if (open && event.target !== host) { open = false; render(); } });
    document.body.appendChild(host);
    render();
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  /* Petit point d'entrée pour les tests et la console : window.apiPortalDesign.set('c') */
  window.apiPortalDesign = { set: (id) => known(id) && apply(id, true), get: () => current, list: () => DESIGNS.map((d) => d.id) };
})();
