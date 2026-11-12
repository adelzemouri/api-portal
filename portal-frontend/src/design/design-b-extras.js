/*
 * Retouches du design B (Graphite Premium) qui touchent à la structure et non au style.
 *
 * Elles sont faites ici pour pouvoir juger du résultat sans modifier l'application ; à
 * l'intégration définitive, les reporter dans les templates Angular et supprimer ce fichier :
 *   - le compte à rebours « next sync » quitte la barre de navigation et s'affiche dans
 *     l'en-tête de colonne « Sync » du tableau « Environment health » ;
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

  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'aria-label' || !r.target.matches('button.copy') || r.oldValue === null) continue;
      if (!restLabel.has(r.target)) restLabel.set(r.target, r.oldValue);
      r.target.toggleAttribute('data-copied', r.target.getAttribute('aria-label') !== restLabel.get(r.target));
    }
    if (!queued) { queued = true; requestAnimationFrame(mirrorEta); }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-label', 'data-design'] });
})();
