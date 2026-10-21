// Phasen 4–7 – Akzeptanzkriterien (TODO bis zur Umsetzung)
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Phasen 4–7 · RPE, Plan 3+1, Datenerfassung, Release';

export default function ({ todo, assert, loadApp, REPO_ROOT }) {
  // ── Phase 4 ──
  todo('4.1 RPE-Schnellwahl 6/7/8/9/10 (lang drücken für ,5) mit RIR-Übersetzung');
  todo('4.2 Varianz-Check: > 70 % gleiche RPE in den letzten 40 Sätzen → AMRAP-Karte');
  todo('4.3 Kalibrierung: AppState.rpeOffset aus AMRAP-Satz, angezeigt, nicht in e1rm eingerechnet');

  // ── Phase 5 ──
  todo('5 plan3plus1(): 7 Tage, 3 Pflicht-Gymtage, 1 optionaler Tag', () => {
    const p = loadApp({}).plan3plus1();
    assert.equal(p.length, 7);
    assert.equal(p.filter((d) => d.type === 'gym' && !d.optional).length, 3);
    assert.equal(p.filter((d) => d.optional === true).length, 1);
  });

  todo('5 plan3plus1(): simulierte Woche ergibt für hams mindestens 6 Sätze', () => {
    const ctx = loadApp({}, { now: '2026-10-20T20:00:00Z' });
    const days = ctx.plan3plus1().filter((d) => d.type === 'gym' && !d.optional);
    ctx.AppState.history = days.map((d, i) => ({
      ts: Date.parse('2026-10-15T17:00:00Z') + i * 864e5, dayName: d.name, durationMs: 3e6, volume: 0,
      sets: d.ex.flatMap((e) => {
        const n = parseInt(String(e.s), 10) || 3;
        return Array.from({ length: n }, () => (e.timed ? { ex: e.n, secs: 30 } : { ex: e.n, w: 50, r: 10, rpe: 8 }));
      }),
    }));
    const hams = ctx.weeklyMuscleSets().hams || 0;
    assert.ok(hams >= 6, `hams ${hams}`);
  });

  todo('5 plan3plus1(): bestehende Übungsnamen unverändert, Copenhagen Adduction als timed-Variante', () => {
    const ctx = loadApp({});
    const known = new Set([
      ...ctx.defaultPlan().flatMap((d) => d.ex.map((e) => e.n)),
      ...ctx.EXERCISE_FAMILIES.flatMap((f) => f.variants.map((v) => v.n)),
    ]);
    const neu = ctx.plan3plus1().flatMap((d) => d.ex.map((e) => e.n)).filter((n) => !known.has(n));
    assert.deepEqual([...new Set(neu)], [], `unbekannte Namen: ${neu.join(', ')}`);
    const cop = ctx.EXERCISE_FAMILIES.flatMap((f) => f.variants).find((v) => v.n === 'Copenhagen Adduction');
    assert.ok(cop && cop.timed === true, 'Copenhagen Adduction fehlt oder ist nicht timed');
  });

  // ── Phase 6 ──
  todo('6.1 Montags Gewicht-Karte, wenn letzter weightLog-Eintrag älter als 7 Tage');
  todo('6.2 Luna-Erinnerung, wenn wearableLog seit 3 Tagen leer ist');

  // ── Phase 7 ──
  todo('7 sw.js: CACHE = kinetic-v2', () => {
    const sw = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
    assert.match(sw, /CACHE\s*=\s*['"]kinetic-v2['"]/);
  });
}
