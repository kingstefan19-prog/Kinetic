// feat/athlete-mode Phase C8 – Layout im echten Browser (Playwright, vorinstalliertes Chromium)
// Synthetisches Fixture, keine echten Daten. Ohne Playwright wird der Test als TODO geführt.
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const title = 'Layout · kein horizontales Scrollen, Kopf ≤ 64 px, Touch-Flächen (390×844, 360×740)';

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch (e) { /* global versuchen */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return req(path.join(root, 'playwright'));
  } catch (e) { return null; }
}

const VIEWPORTS = [[390, 844], [360, 740]];
const PAGES = ['dash', 'plan', 'workout', 'log', 'data', 'ern'];

export default function ({ test, todo, assert, loadFixture, REPO_ROOT }) {
  const pw = loadPlaywright();
  if (!pw) { todo('C8 Layout-Prüfung im Browser (Playwright nicht verfügbar)'); return; }

  test('C8 Kein horizontales Scrollen auf allen Seiten; Kopf ≤ 64 px; Workout-Touch-Flächen ≥ 44 px', async () => {
    const fx = loadFixture('realistic-3plus1');
    const st = JSON.parse(JSON.stringify(fx.state));
    st.user = Object.assign({}, st.user, { trainingGoal: 'athlete' });
    st.schedule = { appointments: [
      { id: 'tr', name: 'Fußball Training', weekdays: [2, 4], time: '19:00', minutes: 90 },
      { id: 'sp', name: 'Spiel', weekdays: [6], time: '15:00', minutes: 90 }] };
    const url = pathToFileURL(path.join(REPO_ROOT, 'index.html')).href;
    const browser = await pw.chromium.launch();
    const problems = [];
    try {
      for (const [w, h] of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
        const p = await ctx.newPage();
        await p.clock.setFixedTime(Date.parse(fx._fixture.now));
        await p.addInitScript((s) => {
          if (sessionStorage.getItem('seeded')) return;
          sessionStorage.setItem('seeded', '1');
          localStorage.clear();
          for (const k in s) localStorage.setItem('kinetic.' + k, JSON.stringify(s[k]));
          localStorage.setItem('kinetic.planVersion', '5');
          localStorage.setItem('kinetic.planSource', '"default"');
        }, st);
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(url);
        await p.waitForTimeout(300);
        for (const pg of PAGES) {
          await p.evaluate((n) => {
            if (n === 'workout' && !AppState.activeSession) startRecommended();
            navigate(n);
          }, pg);
          await p.waitForTimeout(120);
          const m = await p.evaluate(() => ({
            sw: document.documentElement.scrollWidth, iw: window.innerWidth,
            hero: (function () { const e = document.getElementById('heroSection'); return e && e.style.display !== 'none' ? e.getBoundingClientRect().height : 0; })(),
          }));
          if (m.sw > m.iw) problems.push(`${w}×${h} ${pg}: scrollWidth ${m.sw} > ${m.iw}`);
          if (m.hero > 64) problems.push(`${w}×${h} ${pg}: Kopf ${m.hero} px > 64`);
          if (pg === 'workout') {
            const small = await p.evaluate(() => [...document.querySelectorAll('.wo-sets input, .wo-sets button, .wo-bar .btn, .wo-pill, #addSetBtn, .wa-ico, .abort-btn')]
              .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height < 44)
              .map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().height)));
            for (const s of small) problems.push(`${w}×${h} workout: Touch-Fläche < 44 px: ${s}`);
          }
        }
        if (errors.length) problems.push(`${w}×${h} JS-Fehler: ${errors.join(' | ')}`);
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
    assert.deepEqual(problems, []);
  });
}
