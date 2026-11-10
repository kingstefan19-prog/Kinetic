// feat/athlete-mode Phase C – Design und UI
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Design · Tokens, Kontrast, Heute, Workout, Plan-Menü, Icons, a11y';

// WCAG-Kontrast zweier Hex-Farben
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export default function ({ test, assert, loadApp, REPO_ROOT }) {
  const html = () => fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const tokens = () => {
    const root = html().match(/:root\{([\s\S]*?)\}/)[1], t = {};
    for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) t[m[1]] = m[2];
    return t;
  };

  test('C1 Tokens: Abstände, --t3, gefüllte rote Knöpfe', () => {
    const src = html();
    assert.match(src, /--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px/);
    const t = tokens();
    assert.equal(t.t3.toUpperCase(), '#8E8E93');
    assert.equal(t['accent-fill'].toUpperCase(), '#D32F2F');
    assert.match(src, /\.bp\{background:var\(--accent-fill\)/);
  });

  test('C1 Kontrast: Textfarben ≥ 4,5:1 gegen die Hintergründe', () => {
    const t = tokens();
    for (const fg of ['t1', 't2', 't3']) for (const bg of ['bg', 'card', 'card2']) {
      const r = contrast(t[fg], t[bg]);
      assert.ok(r >= 4.5, `--${fg} auf --${bg}: ${r.toFixed(2)}`);
    }
    for (const fg of ['t1', 't2']) assert.ok(contrast(t[fg], t.card3) >= 4.5, `--${fg} auf --card3`);
    assert.ok(contrast('#FFFFFF', t['accent-fill']) >= 4.5, 'Weiß auf --accent-fill');
    // --t3 nie als Textfarbe auf --card3 (dort nur 4,28:1)
    assert.doesNotMatch(html(), /background:var\(--card3\)[^"'>}\n]*color:var\(--t3\)|color:var\(--t3\)[^"'>}\n]*background:var\(--card3\)/);
  });

  test('C1 Schrift mindestens 12 px, nur das Nav-Label 11 px', () => {
    const src = html();
    const small = [...src.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => +m[1]).filter((v) => v < 12);
    assert.equal(small.length, 1, 'genau eine Ausnahme');
    assert.match(src, /\.nl\{font-size:11px/);
    const short = [...src.matchAll(/font:\s*\d+\s+([0-9.]+)px/g)].map((m) => +m[1]).filter((v) => v < 12);
    assert.equal(short.length, 0);
  });

  test('C2 Heute: kompakter Kopf, Reihenfolge, Essen im Profil', () => {
    const src = html();
    assert.match(src, /<h1 class="hero-name" id="heroName">/);
    assert.doesNotMatch(src, /hero-title|Dein Körper\./);
    assert.match(src, /\.hero\{[^}]*max-height:calc\(env\(safe-area-inset-top\) \+ 64px\)/);
    const dash = src.slice(src.indexOf('<section id="page-dash"'), src.indexOf('<!-- ══ PAGE: PLAN'));
    const order = ['todayCard', 'smartNotifs', 'weekStrip', 'strengthCard', 'weeklyWeight', 'weightChart', 'coachCard'].map((id) => dash.indexOf('id="' + id + '"'));
    order.forEach((v, i) => { assert.ok(v > 0, 'fehlt: ' + i); if (i) assert.ok(v > order[i - 1], 'Reihenfolge ' + i); });
    assert.doesNotMatch(dash, /dashKcal|id="heroStats"/, 'Kalorien und Pillen nicht auf Heute');
    const nav = src.slice(src.indexOf('<nav class="nav">'), src.indexOf('</nav>'));
    assert.deepEqual([...nav.matchAll(/data-nav="(\w+)"/g)].map((m) => m[1]), ['dash', 'plan', 'workout', 'log', 'data']);
    assert.match(nav, />Heute</);
    const prof = src.slice(src.indexOf('<section id="page-data"'));
    assert.match(prof, /id="heroStats"/);
    assert.match(prof, /navigate\('ern'\)/);
  });

  test('C2 Kopf zeigt Name, Datum, Zykluswoche; Ernährung markiert Profil', () => {
    const c = loadApp({ user: { name: 'Test' } }, { now: '2026-11-10T08:00:00Z' });
    c.renderHeroStats();
    assert.equal(c.document.getElementById('heroName').textContent, 'Test');
    assert.match(c.document.getElementById('heroMeta').textContent, /10\.11\..*Wo \d/);
  });

  test('C2 Wochenleiste: Mo–So mit Terminen, erledigtem Gym und Vorschlag', () => {
    const sched = { appointments: [{ id: 'tr', name: 'Training', weekdays: [2, 4], time: '19:00' }] };
    const hist = [{ ts: Date.parse('2026-11-09T17:00:00'), dayName: 'Lower', durationMs: 3e6, volume: 0, sets: [{ ex: 'Kniebeuge (LH)', w: 100, r: 5, rpe: 8 }] }];
    const c = loadApp({ schedule: sched, history: hist }, { now: '2026-11-10T08:00:00' });
    c.renderWeekStrip();
    const h = c.document.getElementById('weekStrip').innerHTML;
    assert.equal((h.match(/class="wday( today)?"/g) || []).length, 7);
    assert.match(h, /aria-label="Montag: Gym: Lower"/);
    assert.match(h, /class="wday today"[^>]*aria-label="Dienstag/);
    assert.match(h, /aria-label="Mittwoch: 19:00 Training"/);
    assert.match(h, /aria-label="Freitag: 19:00 Training"/);
  });

  test('C3 Workout: Satztabelle direkt unter Name/Ziel/Letztes Mal, Coach einzeilig, Details, feste Leiste', () => {
    const ex = 'Bankdrücken (LH)';
    const hist = [{ ts: Date.parse('2026-11-03T17:00:00'), dayName: 'Upper A', durationMs: 3e6, volume: 0, sets: [{ ex, w: 100, r: 8, rpe: 8 }] }];
    const c = loadApp({ history: hist }, { now: '2026-11-10T08:00:00' });
    c.AppState.activeSession = { dayId: 'x', dayName: 'Upper A', startTs: c.Date.now(), currentIdx: 0, restEndTs: 0,
      exercises: [{ n: ex, s: '4×5-8', coach: { hint: 'Gleiches Gewicht – +1 Wdh anpeilen.', weight: 100, reps: 9 }, done: false, sets: [{ w: '100', r: '', rpe: '', done: false }] }] };
    c.renderWorkout();
    const h = c.document.getElementById('workoutContent').innerHTML;
    const iName = h.indexOf('class="wo-name"'), iGoal = h.indexOf('class="wo-goal"'), iLast = h.indexOf('class="wo-last"'), iTab = h.indexOf('<table class="wo-sets">');
    assert.ok(iName > 0 && iName < iGoal && iGoal < iLast && iLast < iTab, 'Reihenfolge Name → Ziel → Letztes Mal → Tabelle');
    assert.doesNotMatch(h.slice(iLast, iTab), /Coach|Technik|Gewichtsschritt|E1RM/, 'nichts zwischen Kopf und Tabelle');
    assert.match(h, /<details class="coach-1l"><summary>🧠 Coach: 100 kg × 9<\/summary>/);
    const det = h.slice(h.indexOf('<details class="wo-details"'));
    assert.match(det, /Technik:/);
    assert.match(det, /Gewichtsschritt an deinem Gerät/);
    assert.match(det, /data-rest="90"/);
    assert.match(h, /<div class="wo-bar">[\s\S]*data-rest=[\s\S]*id="nextExBtn"/);
    // Pause läuft: Timer in der Leiste
    c.AppState.activeSession.restEndTs = c.Date.now() + 60000; c.renderWorkout();
    assert.match(c.document.getElementById('workoutContent').innerHTML, /<div class="wo-bar">\s*<div class="wo-rest on"><span id="restTimer">60s/);
    const src = html();
    assert.match(src, /\.wo-sets input,\.wo-sets button\{min-height:44px\}/);
    assert.match(src, /\.wo-bar\{position:fixed;[^}]*bottom:calc\(var\(--nav-h\) \+ env\(safe-area-inset-bottom\)\)/);
  });

  test('C4 Plan-Kopf: die vier Knöpfe liegen im Menü "⋯"', () => {
    const src = html();
    const head = src.slice(src.indexOf('<section id="page-plan"'), src.indexOf('id="planList"'));
    const menu = head.slice(head.indexOf('<details class="pmenu"'), head.indexOf('</details>'));
    for (const fn of ['id="editDaysBtn"', 'openOnboarding()', 'offerPlan3plus1()', 'resetToDefaultPlan()']) assert.ok(menu.includes(fn), fn);
    assert.equal((head.match(/<button/g) || []).length - (menu.match(/<button/g) || []).length, 2, 'außerhalb nur "Fertig" und Glossar');
    const c = loadApp({}, { now: '2026-11-10T08:00:00' });
    c.document.getElementById('planMenu').open = true;
    c.closePlanMenu();
    assert.equal(c.document.getElementById('planMenu').open, false);
  });
}
