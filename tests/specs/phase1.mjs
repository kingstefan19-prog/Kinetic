// Phase 1: Datenqualität – Akzeptanzkriterien (TODO bis zur Umsetzung)
export const title = 'Phase 1 · Datenqualität';

const DAY = 864e5;
function session(date, ex, rows, extra = {}) {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName: 'Test', durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })), ...extra };
}
function workout(ctx, exercises, extra = {}) {
  ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
    exercises: exercises.map((e) => ({ isTimed: false, coach: {}, done: false, ...e })), ...extra };
}
const html = (ctx) => ctx.document.getElementById('workoutContent').innerHTML;
const SC = 'Skull Crushers (LH)';

export default function ({ test, todo, assert, loadApp, loadFixture }) {
  test('1.1 Gewicht > 1,5× des letzten Arbeitsgewichts → Inline-Rückfrage statt Abhaken', () => {
    const ctx = loadApp({ history: [session('2026-10-12', SC, [[25, 10, 8], [25, 10, 8], [25, 9, 8]])] }, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: SC, s: '3×8-10', sets: [{ w: '125', r: '10', rpe: '', done: false }, { w: '25', r: '10', rpe: '', done: false }] }]);
    assert.equal(ctx.toggleSetDone(0), 'ask');
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[0].done, false);
    ctx.renderWorkout();
    assert.match(html(ctx), /125 kg statt 25 kg\?/);
    assert.match(html(ctx), /Bestätigen/);
    assert.match(html(ctx), /Korrigieren/);
    // Korrigieren: Rückfrage weg, Satz bleibt offen
    ctx.fixPlausible();
    ctx.renderWorkout();
    assert.doesNotMatch(html(ctx), /statt 25 kg/);
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[0].done, false);
    // Bestätigen: Satz wird abgehakt, kein zweites Nachfragen
    ctx.toggleSetDone(0);
    ctx.confirmPlausible();
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[0].done, true);
    // normales Gewicht → direkt abgehakt
    assert.equal(ctx.toggleSetDone(1), 'done');
  });

  test('1.1 Gewicht < 0,5× fragt nach; ohne Historie und bei Körpergewicht keine Rückfrage', () => {
    const ctx = loadApp({ history: [session('2026-10-12', 'Bankdrücken (LH)', [[110, 8, 8], [110, 8, 8], [110, 7, 8]])] }, { now: '2026-10-19T17:00:00Z' });
    assert.match(ctx.plausibilityIssue('Bankdrücken (LH)', { w: '11', r: '8' }, false, false).msg, /11 kg statt 110 kg\?/);
    assert.equal(ctx.plausibilityIssue('Bankdrücken (LH)', { w: '112.5', r: '8' }, false, false), null);
    assert.equal(ctx.plausibilityIssue('Beinpresse', { w: '400', r: '8' }, false, false), null, 'ohne Historie kein Vergleich');
    assert.equal(ctx.plausibilityIssue('Klimmzüge', { add: '40', r: '8' }, false, true), null);
  });

  test('1.1 Wdh nur 1–50: Abhaken blockiert (nur "Korrigieren"), > 50 wird nicht gespeichert', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [{ w: '45', r: '120', rpe: '8', done: false }, { w: '45', r: '12', rpe: '8', done: false }] }]);
    assert.equal(ctx.toggleSetDone(0), 'ask');
    ctx.renderWorkout();
    assert.match(html(ctx), /Erlaubt sind 1–50 Wdh/);
    assert.doesNotMatch(html(ctx), /id="plausOk"/, 'bei Wdh gibt es kein Bestätigen');
    assert.match(html(ctx), /data-set-field="r"[^>]*min="1" max="50"/);
    ctx.finishWorkout();
    const saved = ctx.AppState.history[0].sets;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].r, 12);
  });

  test('1.1 RPE nur 5–10 in 0,5-Schritten: Buttons 6–10, beim Speichern wird alles andere verworfen', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [
      { w: '45', r: '12', rpe: '78', done: true }, { w: '45', r: '12', rpe: '8.3', done: true },
      { w: '45', r: '12', rpe: '4', done: true }, { w: '45', r: '12', rpe: '9.5', done: true }] }]);
    ctx.renderWorkout();
    assert.doesNotMatch(html(ctx), /data-set-field="rpe"/, 'kein Zahlenfeld für RPE (Phase 4 bleibt)');
    const vals = [...html(ctx).matchAll(/data-rpe-val="([\d.]+)"/g)].map((m) => +m[1]);
    assert.deepEqual(vals, [6, 7, 8, 9, 10]);
    ctx.finishWorkout();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.AppState.history[0].sets.map((x) => x.rpe))), [null, 8.5, null, 9.5]);
  });
  todo('1.2 Session-Dauer über lastSetTs, Karte für offene Session > 3 h, > 4 h aus Zeit-Kennzahlen');
  todo('1.3 Log: Satz bearbeiten/löschen, Session löschen, PRs neu berechnen, "Mehr laden"');
  todo('1.4 Bereinigungs-Assistent: outliers.json liefert genau 3 Funde');

  todo('1.4 Nach Löschen des 125-kg-Satzes liegt der PR für Skull Crushers (LH) unter 60', () => {
    const ctx = loadApp(loadFixture('outliers'));
    assert.ok(ctx.AppState.prs['Skull Crushers (LH)'] >= 60, 'Ausgangslage: Tippfehler treibt den PR hoch');
    for (const s of ctx.AppState.history) {
      s.sets = s.sets.filter((x) => !(x.ex === 'Skull Crushers (LH)' && x.w === 125));
    }
    ctx.AppState.prs = ctx.recomputePRs(ctx.AppState.history);
    assert.ok(ctx.AppState.prs['Skull Crushers (LH)'] < 60, `PR ${ctx.AppState.prs['Skull Crushers (LH)']}`);
  });
}
