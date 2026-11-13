/*
 * Animations du design B (Graphite Premium) qui ne peuvent pas s'écrire en CSS seul.
 *
 * Isolé de l'application : aucun import, aucun appel réseau, aucun gestionnaire d'événement
 * applicatif touché. Le script observe le DOM et ajoute des éléments purement décoratifs :
 *   - sorties (menu, palette, volet) : une copie inerte de l'élément retiré joue la sortie,
 *     20 % plus courte que l'entrée, vers son déclencheur ;
 *   - élément actif partagé (navigation, environnement) : une pastille glisse de l'ancien au
 *     nouveau, en ease-in-out, étirée de 12 % et sur une légère courbe ;
 *   - réussite d'une copie : pulsation et fondu flouté du libellé ;
 *   - élastique quand on atteint le haut ou le bas du volet et de la palette.
 * Inactif hors du design B et si le système demande moins d'animations.
 *
 * Intégration définitive dans Angular : préférer `animate.leave` pour les sorties et
 * `withViewTransitions()` sur le routeur, puis supprimer les parties correspondantes ici.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = () => root.getAttribute('data-design') === 'b' && !reduced.matches;

  const OUT = 'cubic-bezier(0.4, 0, 1, 1)';          /* sortie : accélère */
  const IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
  const exit = (ms) => Math.round(ms * 0.8);          /* sorties 20 % plus courtes */

  /* ---------- Sorties ---------- */
  const fade = [{ opacity: 1 }, { opacity: 0 }];
  const EXITS = [
    { match: (n) => n.matches('.user-menu-panel'), ms: exit(200), frames: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.95)' }] },
    { match: (n) => n.matches('.palette-backdrop'), ms: exit(220), frames: fade, inner: ['.palette', [{ transform: 'scale(1)' }, { transform: 'scale(0.95)' }]] },
    { match: (n) => n.matches('.side-drawer'), ms: exit(320), frames: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(40px) scale(0.985)' }] },
    { match: (n) => n.matches('.drawer-backdrop'), ms: exit(320), frames: fade },
  ];

  function playExit(node, parent, before, rule) {
    const ghost = node.cloneNode(true);
    ghost.setAttribute('data-motion-ghost', '');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    parent.insertBefore(ghost, before && before.parentNode === parent ? before : null);
    const options = { duration: rule.ms, easing: OUT, fill: 'forwards' };
    if (rule.inner) { const el = ghost.querySelector(rule.inner[0]); if (el) el.animate(rule.inner[1], options); }
    const done = () => ghost.remove();
    const anim = ghost.animate(rule.frames, options);
    anim.finished.then(done, done);
    setTimeout(done, rule.ms + 80);
  }

  /* ---------- Élément actif partagé ---------- */
  const GROUPS = [
    { container: '.sidebar nav', current: ':scope > button.active', axis: 'y' },
    { container: '.env-switch', current: ':scope > button[aria-pressed="true"]', axis: 'x' },
  ];
  const last = new WeakMap();

  /* Glissements partis au clic, en attente que l'application confirme le nouvel élément actif */
  const pending = new WeakMap();

  function settle(container) {
    const p = pending.get(container);
    if (!p) return;
    pending.delete(container);
    clearTimeout(p.timer);
    p.thumb.remove();
    p.to.removeAttribute('data-motion-landing');
    p.from.removeAttribute('data-motion-leaving');
  }

  function glide(container, from, to, axis, hold) {
    const box = container.getBoundingClientRect();
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (!a.width || !b.width) return;
    settle(container);
    container.querySelectorAll(':scope > .motion-thumb').forEach((t) => t.remove());
    const thumb = document.createElement('span');
    thumb.className = 'motion-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    thumb.style.cssText = `left:${b.left - box.left - container.clientLeft}px;top:${b.top - box.top - container.clientTop}px;width:${b.width}px;height:${b.height}px;border-radius:${getComputedStyle(to).borderRadius};`;
    container.appendChild(thumb);
    to.setAttribute('data-motion-landing', '');
    const dx = a.left - b.left, dy = a.top - b.top;
    /* À mi-course : étiré de 12 % dans le sens du mouvement, décalé de 3 px pour dessiner une courbe */
    const mid = axis === 'x' ? `translate(${dx / 2}px, -3px) scale(1.12, 1)` : `translate(3px, ${dy / 2}px) scale(1, 1.12)`;
    const anim = thumb.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: mid }, { transform: 'none' }], { duration: 280, easing: IN_OUT });
    if (hold) {
      /* Parti au clic : la pastille reste posée jusqu'à ce que l'application rende l'élément actif */
      from.setAttribute('data-motion-leaving', '');
      pending.set(container, { thumb, from, to, done: false, timer: setTimeout(() => settle(container), 2500) });
      const arrived = () => { const p = pending.get(container); if (p && p.thumb === thumb) { p.done = true; if (p.confirmed) settle(container); } };
      anim.finished.then(arrived, arrived);
      return;
    }
    const done = () => { thumb.remove(); to.removeAttribute('data-motion-landing'); };
    anim.finished.then(done, done);
    setTimeout(done, 400);
  }

  function syncGroups(animate) {
    for (const g of GROUPS) {
      const container = document.querySelector(g.container);
      if (!container) continue;
      const now = container.querySelector(g.current);
      const before = last.get(container);
      const p = pending.get(container);
      if (p && now === p.to) { p.confirmed = true; if (p.done) settle(container); }
      else if (p && now && now !== p.from) settle(container);
      if (animate && now && before && before !== now && before.isConnected && !pending.has(container) && !(p && now === p.to)) glide(container, before, now, g.axis, false);
      if (now) last.set(container, now);
    }
  }

  /* Le glissement part dès l'appui de la souris, sans attendre le clic ni le rendu de la page demandée :
     la pastille est déjà en route (sur le compositeur) quand l'application occupe le fil principal.
     Au clavier et au toucher, il part au clic. On n'intercepte rien. */
  function start(event, press) {
    if (!active() || !(event.target instanceof Element)) return;
    for (const g of GROUPS) {
      const container = document.querySelector(g.container);
      const to = container && event.target.closest(`${g.container} > button`);
      if (!to || to.disabled) continue;
      const p = pending.get(container);
      if (p && p.to === to) continue;
      const from = container.querySelector(g.current);
      if (from && from !== to) {
        glide(container, from, to, g.axis, true);
        last.set(container, to);
        if (press) pending.get(container).press = true;
      }
    }
  }
  /* Appui relâché ailleurs : pas de clic, la pastille revient à l'élément actif */
  function release(event) {
    for (const g of GROUPS) {
      const container = document.querySelector(g.container);
      const p = container && pending.get(container);
      if (!p || !p.press) continue;
      p.press = false;
      if (event.type === 'pointerup' && event.target instanceof Element && p.to.contains(event.target)) continue;
      settle(container);
      last.set(container, p.from);
    }
  }
  document.addEventListener('pointerdown', (event) => { if (event.pointerType === 'mouse' && event.button === 0) start(event, true); }, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('click', (event) => start(event, false), true);

  /* ---------- Réussite d'une copie ---------- */
  const restLabel = new WeakMap();
  function copyFeedback(button, oldLabel) {
    if (!restLabel.has(button)) restLabel.set(button, oldLabel);
    const succeeded = button.getAttribute('aria-label') !== restLabel.get(button);
    button.animate([{ opacity: 0.35, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    if (!succeeded) return;
    const ok = getComputedStyle(root).getPropertyValue('--ds-ok').trim() || '#3ecf8e';
    button.animate([
      { boxShadow: `0 0 0 0 ${ok}`, transform: 'scale(1)' },
      { boxShadow: `0 0 0 3px color-mix(in srgb, ${ok} 45%, transparent)`, transform: 'scale(1.05)', offset: 0.4 },
      { boxShadow: `0 0 0 7px color-mix(in srgb, ${ok} 0%, transparent)`, transform: 'scale(1)' },
    ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }

  /* ---------- Observation ---------- */
  new MutationObserver((records) => {
    if (!active()) { syncGroups(false); return; }
    for (const r of records) {
      if (r.type === 'attributes') {
        if (r.attributeName === 'aria-label' && r.target.matches('button.copy') && r.oldValue && !r.target.closest('[data-motion-ghost]')) copyFeedback(r.target, r.oldValue);
        continue;
      }
      if (!r.target.isConnected || r.target.closest('[data-motion-ghost]')) continue;
      for (const node of r.removedNodes) {
        if (node.nodeType !== 1 || node.hasAttribute('data-motion-ghost') || node.classList.contains('motion-thumb')) continue;
        const rule = EXITS.find((x) => x.match(node, r.target));
        if (rule) playExit(node, r.target, r.nextSibling, rule);
      }
    }
    syncGroups(true);
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'aria-pressed', 'aria-label'] });

  /* ---------- Élastique aux limites ---------- */
  const bouncing = new WeakSet();
  window.addEventListener('wheel', (event) => {
    if (!active() || !event.deltaY || !(event.target instanceof Element)) return;
    const zone = event.target.closest('.side-drawer, .palette');
    if (!zone) return;
    let el = event.target;
    while (el && el !== zone.parentElement) {
      const scrolls = el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY);
      if (scrolls) break;
      el = el.parentElement;
    }
    if (!el || el === zone.parentElement) el = zone;
    const atTop = el.scrollTop <= 0, atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (!((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) || bouncing.has(el)) return;
    const content = el.firstElementChild && el !== zone ? el : zone.querySelector('.side-drawer-body, .palette-results') || el;
    bouncing.add(el);
    const pull = event.deltaY < 0 ? 10 : -10;
    const anim = content.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${pull}px)`, offset: 0.3 }, { transform: 'translateY(0)' }], { duration: 460, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    const done = () => bouncing.delete(el);
    anim.finished.then(done, done);
  }, { passive: true });
})();
