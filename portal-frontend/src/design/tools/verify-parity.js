// Parcours fonctionnel identique sur l'export d'origine et sur l'export avec le design : les résultats doivent être les mêmes.
// Usage : node verify-parity.js <export.html> <export-avec-design.html>
const { chromium } = require('playwright');
(async () => {
  const files = { original: process.argv[2], design: process.argv[3] }; const b = await chromium.launch(); const out = {};
  for (const d of ['original', 'design']) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + files[d]); await p.waitForTimeout(2200);
    const r = {}; const rows = () => p.locator('table.list tbody tr.row').count();
    const nav = async i => { await p.locator('.sidebar nav button').nth(i).click(); await p.waitForTimeout(700); };
    r.homeCounts = await p.locator('.catalog-strip strong').allTextContents();
    await p.locator('.env-switch button').nth(1).click(); await p.waitForTimeout(700);
    r.simCounts = await p.locator('.catalog-strip strong').allTextContents();
    await p.locator('.env-switch button').nth(0).click(); await p.waitForTimeout(700);
    await p.locator('.catalog-strip a').first().click(); await p.waitForTimeout(700); r.stripLink = await p.locator('app-apis-page').count();
    r.apiRows = await rows();
    await p.locator('label.search input').fill('ged'); await p.waitForTimeout(500); r.filterGed = await rows();
    await p.locator('label.search input').fill(''); await p.waitForTimeout(400);
    await p.locator('.chip', { hasText: 'Without' }).click(); await p.waitForTimeout(400); r.chipWithout = await rows();
    await p.locator('.chip', { hasText: 'All' }).click(); await p.waitForTimeout(400);
    await p.locator('button.sort', { hasText: 'Version' }).click(); await p.waitForTimeout(400); r.sortFirst = (await p.locator('.row-title-button').first().textContent()).trim();
    await p.locator('.row-title-button').first().click(); await p.waitForTimeout(600);
    r.drawerTitle = (await p.locator('.side-drawer-head h3').textContent()).trim(); r.drawerSections = await p.locator('.drawer-section').count();
    await p.locator('.drawer-journey-point').nth(1).click(); await p.waitForTimeout(600); r.afterJourneyEnv = await p.locator('.env-switch button[aria-pressed="true"]').textContent();
    await p.keyboard.press('Escape'); await p.waitForTimeout(400); r.drawerClosed = await p.locator('.side-drawer').count();
    await p.locator('.env-switch button').nth(0).click(); await p.waitForTimeout(600);
    r.pager = await p.locator('.pager-range').allTextContents();
    await nav(2); r.appRows = await rows();
    await p.locator('.row-title-button').nth(1).click(); await p.waitForTimeout(600); r.appDrawer = (await p.locator('.side-drawer-head h3').textContent()).trim();
    const link = p.locator('.side-drawer a').first(); if (await link.count()) { await link.click(); await p.waitForTimeout(700); r.stackedDrawer = (await p.locator('.side-drawer-head h3').textContent()).trim(); }
    await p.locator('.side-drawer .icon-btn').first().click(); await p.waitForTimeout(400);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('printer'); await p.waitForTimeout(500);
    r.paletteResults = await p.locator('.palette-option').count(); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    r.paletteOpened = await p.locator('.side-drawer-head h3').count() ? (await p.locator('.side-drawer-head h3').textContent()).trim() : null;
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.locator('.user-menu-trigger').click(); await p.waitForTimeout(300); await p.locator('.lang-toggle').click(); await p.waitForTimeout(500);
    r.frNav = (await p.locator('.sidebar nav button').allTextContents()).map(s => s.trim());
    await p.locator('.lang-toggle').click(); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.locator('.page-head h2').click();
    await nav(3); r.helpTables = await p.locator('app-help table').count(); r.guide = await p.evaluate(() => !!document.querySelector('.understand-wso2-native')?.shadowRoot?.querySelector('h1,h2'));
    await p.locator('button.copy').first().click(); await p.waitForTimeout(300); r.copyLabel = (await p.locator('button.copy').first().textContent()).trim();
    r.errors = errs;
    out[d] = JSON.stringify(r); await ctx.close();
  }
  console.log(out.original);
  console.log(out.design === out.original ? 'IDENTIQUE à l\'original' : 'DIFF ' + out.design);
  if (out.design !== out.original) process.exitCode = 1;
  await b.close();
})();
