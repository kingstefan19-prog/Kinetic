// feat/rir-meso – RIR als Eingabe, Anpassung in der Session, Mesozyklus, Ziel-RIR
export const title = 'RIR & Mesozyklus';

const DAY = 864e5;
function session(date, ex, rows, dayName = 'Test') {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}
function workout(ctx, exercises, extra = {}) {
  ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
    exercises: exercises.map((e) => ({ isTimed: false, coach: {}, done: false, ...e })), ...extra };
}
const html = (ctx, id = 'workoutContent') => ctx.document.getElementById(id).innerHTML;
const plain = (x) => JSON.parse(JSON.stringify(x));

export default function ({ test, assert, loadApp }) {
  // ── 1 RIR als Haupteingabe ──
  test('1 Alte Backups mit rpe-Werten werden als RIR angezeigt (Workout, Log, Bearbeiten)', () => {
    const SC = 'Seitheben (Kabel)';
    const ctx = loadApp({ history: [session('2026-10-15', SC, [[20, 14, 8], [20, 13, 9.5]])] }, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: SC, s: '3×12-15', sets: [{ w: '20', r: '', rpe: '', done: false }] }]);
    ctx.renderWorkout();
    assert.match(html(ctx), /Letztes Mal: 20 kg × 13 · RIR 0,5 \(RPE 9,5\)/);
    ctx.renderLog();
    assert.match(html(ctx, 'logList'), /20 kg × 14 @RIR 2 · 20 kg × 13 @RIR 0,5/);
    ctx.logStartEdit(0);
    assert.match(html(ctx, 'logList'), /<select id="lg-rpe-0-0"[^>]*>.*<option value="8" selected>RIR 2<\/option>/s);
  });

  test('1 RIR-Eingabe speichert rpe = 10 − RIR (kompatibel zu Historie, e1rm und Backup)', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [{ w: '45', r: '12', rpe: '', done: true }, { w: '45', r: '12', rpe: '', done: true }] }]);
    const cur = ctx.AppState.activeSession.exercises[0];
    ctx.setRirForSet(cur, 0, 1);
    ctx.setRirForSet(cur, 1, 2.5);
    ctx.finishWorkout();
    const sets = ctx.AppState.history[0].sets;
    assert.deepEqual(plain(sets.map((x) => x.rpe)), [9, 7.5]);
    assert.equal(ctx.e1rm(45, 12, 9), ctx.e1rm(45, 13, 10), 'e1rm rechnet weiter mit RPE');
    assert.deepEqual(plain(ctx.buildBackupObject().state.history[0].sets.map((x) => x.rpe)), [9, 7.5]);
  });
}
