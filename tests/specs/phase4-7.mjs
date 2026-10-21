// Phasen 4–7 – Akzeptanzkriterien (TODO bis zur Umsetzung)
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Phasen 4–7 · RPE, Plan 3+1, Datenerfassung, Release';

const DAY = 864e5;
function session(date, sets, dayName = 'Test') {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs: 3e6, volume: 0, sets };
}
function workout(ctx, exercises) {
  ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
    exercises: exercises.map((e) => ({ isTimed: false, coach: {}, done: false, ...e })) };
}

export default function ({ test, todo, assert, loadApp, REPO_ROOT }) {
  // ── Phase 4 ──
  test('4.1 RPE-Schnellwahl 6/7/8/9/10 mit RIR-Übersetzung statt Zahlenfeld', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Seitheben (Kabel)', s: '3×12-15',
      sets: [{ w: '20', r: '14', rpe: '8', done: true }, { w: '20', r: '13', rpe: '', done: false }] }]);
    ctx.renderWorkout();
    const html = ctx.document.getElementById('workoutContent').innerHTML;
    for (const v of [6, 7, 8, 9, 10]) assert.match(html, new RegExp(`data-rpe-val="${v}"`));
    assert.doesNotMatch(html, /data-set-field="rpe"/, 'altes Zahlenfeld noch da');
    assert.match(html, /RPE für Satz 2/, 'Schnellwahl soll auf den ersten offenen Satz zeigen');
    assert.match(html, /lange drücken = ,5/);
    assert.match(html, /8 = noch 2 Wdh möglich/);
  });

  test('4.1 RIR-Texte und Grenzen (5–10 in 0,5-Schritten)', () => {
    const ctx = loadApp({});
    assert.equal(ctx.rirText(8), '8 = noch 2 Wdh möglich');
    assert.equal(ctx.rirText(10), '10 = keine Wdh mehr möglich');
    assert.equal(ctx.rirText(8.5), '8,5 = noch 1–2 Wdh möglich');
    const cur = { sets: [{ rpe: '' }] };
    assert.equal(ctx.setRpeForSet(cur, 0, 8.5), true);
    assert.equal(cur.sets[0].rpe, '8.5');
    assert.equal(ctx.setRpeForSet(cur, 0, 10.5), false);
    assert.equal(ctx.setRpeForSet(cur, 0, 4), false);
    assert.equal(cur.sets[0].rpe, '8.5', 'ungültige Werte dürfen nichts überschreiben');
  });

  test('4.1 Halbe RPE wird beim Beenden als Zahl gespeichert', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Seitheben (Kabel)', s: '3×12-15', sets: [{ w: '20', r: '14', rpe: '8.5', done: true }] }]);
    ctx.finishWorkout();
    assert.equal(ctx.AppState.history[0].sets[0].rpe, 8.5);
  });
  // 40 Sätze in 4 Sessions, davon `gleich` mit RPE 8, der Rest RPE 7
  function rpeHistory(gleich) {
    const rpes = Array.from({ length: 40 }, (_, i) => (i < gleich ? 8 : 7));
    return [0, 1, 2, 3].map((k) => session(`2026-10-${String(5 + k * 3).padStart(2, '0')}`,
      rpes.slice(k * 10, k * 10 + 10).map((rpe) => ({ ex: 'Seitheben (Kabel)', w: 20, r: 14, rpe }))));
  }

  test('4.2 Varianz-Check: > 70 % gleiche RPE in den letzten 40 Sätzen → AMRAP-Karte', () => {
    // 19.10.2026 ist ein Montag → Push A, letzte Isolationsübung: Overhead Extension (KH)
    const ctx = loadApp({ history: rpeHistory(30) }, { now: '2026-10-19T08:00:00Z' });
    const v = ctx.rpeVariance();
    assert.equal(v.value, 8);
    assert.equal(v.share, 0.75);
    ctx.renderSmartNotifs();
    const html = ctx.document.getElementById('smartNotifs').innerHTML;
    assert.match(html, /Deine RPE wirkt gewohnheitsmäßig\. Heute im letzten Satz von Overhead Extension \(KH\) so viele Wdh wie möglich \(AMRAP\)/);
  });

  test('4.2 Genau 70 % oder weniger als 40 bewertete Sätze → keine Karte', () => {
    const ctx = loadApp({ history: rpeHistory(28) }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(ctx.rpeHabitual(), false);
    ctx.renderSmartNotifs();
    assert.doesNotMatch(ctx.document.getElementById('smartNotifs').innerHTML, /AMRAP/);
    const wenig = loadApp({ history: rpeHistory(40).slice(0, 3) }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(wenig.rpeVariance(), null);
  });

  test('4.2 Kein Gym-Tag heute → Karte nennt das nächste Training', () => {
    const ctx = loadApp({ history: rpeHistory(40) }, { now: '2026-10-20T08:00:00Z' });   // Dienstag
    ctx.renderSmartNotifs();
    assert.match(ctx.document.getElementById('smartNotifs').innerHTML, /Im nächsten Training \(Pull A\) im letzten Satz von Face Pulls \(Kabel\)/);
  });

  test('4.2 Workout markiert den letzten Satz der letzten Isolationsübung als AMRAP', () => {
    const ctx = loadApp({ history: rpeHistory(40) }, { now: '2026-10-19T08:00:00Z' });
    const day = ctx.AppState.plan.find((d) => d.id === 'mon');
    ctx.proceedWithWorkout('mon', day, false);
    const s = ctx.AppState.activeSession;
    assert.equal(s.amrapEx, 'Overhead Extension (KH)');
    s.currentIdx = s.exercises.findIndex((e) => e.n === 'Overhead Extension (KH)');
    ctx.renderWorkout();
    const html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /AMRAP im letzten Satz/);
    s.currentIdx = 0;
    ctx.renderWorkout();
    assert.doesNotMatch(ctx.document.getElementById('workoutContent').innerHTML, /AMRAP im letzten Satz/);
  });
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
