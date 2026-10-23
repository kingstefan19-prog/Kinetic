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

  // ── 3 Mesozyklus ──
  const BS = 'Bankdrücken (LH)';
  const train = (dates) => dates.map((d) => session(d, BS, [[100, 8, 8], [100, 8, 8], [100, 8, 8]]));
  const MO = (d) => Date.parse(`${d}T00:00:00`);   // Montag 00:00 lokal = Wochenschlüssel

  test('3 mesoWeek zählt Trainingswochen ab meso.start und ignoriert Wochen ohne Training', () => {
    // Start Mo 07.09.; trainiert in den Wochen 07.09., 21.09. und 05.10. – 14.09. und 28.09. ohne Training
    const ctx = loadApp({ meso: { start: MO('2026-09-07') }, history: train(['2026-09-08', '2026-09-10', '2026-09-22', '2026-10-06']) },
      { now: '2026-10-14T08:00:00Z' });
    assert.equal(ctx.mesoWeek(), 4, '3 Trainingswochen vorbei → Woche 4 (Kalenderwochen wären 6)');
    assert.equal(ctx.mesoInfo().phase, 'Intensivierung');
    assert.equal(ctx.targetRIR(), 1);
  });

  test('3 Pause über 14 Tage: Zyklus startet neu bei Woche 1', () => {
    // 10.09. → 25.09. = 15 Tage Pause; danach Wochen 21.09. (Rückkehr) und 28.09. trainiert
    const ctx = loadApp({ meso: { start: MO('2026-08-31') }, history: train(['2026-09-01', '2026-09-08', '2026-09-10', '2026-09-25', '2026-09-29']) },
      { now: '2026-10-07T08:00:00Z' });
    assert.equal(ctx.mesoWeek(), 3, 'ohne Neustart wäre es Woche 5');
    // laufende Pause: letzte Session vor 15 Tagen → Woche 1
    const pause = loadApp({ meso: { start: MO('2026-08-31') }, history: train(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-21']) },
      { now: '2026-10-06T18:00:00Z' });
    assert.equal(pause.mesoWeek(), 1);
  });

  test('3 Schema: Woche 1–3 RIR 2, Woche 4 RIR 1, Woche 5 Peak Week, Woche 6 Deload, danach automatisch Woche 1', () => {
    const wochen = ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'];
    const at = (n, now) => loadApp({ meso: { start: MO('2026-09-07') }, history: train(wochen.slice(0, n - 1)) }, { now });
    const nows = ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14'].map((d) => `${d}T08:00:00Z`);
    const rir = nows.map((now, i) => at(i + 1, now).targetRIR());
    assert.deepEqual(rir, [2, 2, 2, 1, 1, 4]);
    assert.equal(at(5, nows[4]).mesoInfo().phase, 'Peak Week');
    const w6 = at(6, nows[5]);
    assert.equal(w6.deloadActive(), true);
    assert.equal(w6.mesoInfo().phase, 'Deload');
    // Woche 6 trainiert → in der Woche danach automatisch Woche 1
    const neu = loadApp({ meso: { start: MO('2026-09-07') }, history: train(wochen) }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(neu.mesoWeek(), 1);
    assert.equal(neu.deloadActive(), false);
    assert.equal(neu.AppState.meso.start, MO('2026-10-19'), 'neuer Start = Montag nach der Deload-Woche');
    // Deload-Woche als Ruhewoche (kein Training) → danach ebenfalls Woche 1
    const ruhe = loadApp({ meso: { start: MO('2026-09-07') }, history: train(wochen.slice(0, 5)) }, { now: '2026-10-14T08:00:00Z' });
    assert.equal(ruhe.deloadActive(), true);
    ruhe.__harness.setNow('2026-10-21T08:00:00Z');
    assert.equal(ruhe.mesoWeek(), 1);
    assert.equal(ruhe.deloadActive(), false);
  });

  test('3 Deload-Woche: 1 Satz weniger pro Übung, −10 % Gewicht, optionale Tage ausgeblendet', () => {
    const wochen = ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'];
    const ctx = loadApp({ meso: { start: MO('2026-09-07') }, history: train(wochen) }, { now: '2026-10-14T08:00:00Z' });
    ctx.AppState.plan = ctx.plan3plus1();
    const day = ctx.AppState.plan[0];
    ctx.proceedWithWorkout(day.id, day, false);
    const bank = ctx.AppState.activeSession.exercises.find((e) => e.n === BS);
    assert.equal(bank.sets.length, 3, '4×5-8 → 3 Sätze');
    assert.equal(bank.coach.weight, 90, '−10 %');
    ctx.renderPlan();
    const plan = html(ctx, 'planList');
    assert.doesNotMatch(plan, /Arme \+ Schulter \+ Core/);
    assert.match(plan, /Upper A/);
    assert.match(html(ctx, 'planInfo').replace(/<[^>]+>/g, ''), /Mesozyklus: Woche 6\/6 · Deload · Ziel RIR 4 · optionale Tage ausgeblendet/);
  });

  test('3 Ende Woche 5: Karte "Deload startet" mit Ein-Tipp-Start', () => {
    const wochen = ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'];
    // Woche 5 = 05.10.; alle 4 Pflicht-Gymtage des Standardplans erledigt (Mo/Mi/Do/Sa)
    const w5 = train([...wochen, '2026-10-05', '2026-10-07', '2026-10-08', '2026-10-10']);
    const ctx = loadApp({ meso: { start: MO('2026-09-07') }, history: w5 }, { now: '2026-10-10T19:00:00Z' });
    assert.equal(ctx.mesoWeek(), 5);
    ctx.renderSmartNotifs();
    assert.match(html(ctx, 'smartNotifs'), /Deload startet/);
    assert.match(html(ctx, 'smartNotifs'), /onclick="startDeload\(\)"/);
    // vorher in Woche 5 (erst 1 Session, Mittwoch) noch keine Karte
    const frueh = loadApp({ meso: { start: MO('2026-09-07') }, history: train([...wochen, '2026-10-05']) }, { now: '2026-10-07T08:00:00Z' });
    frueh.renderSmartNotifs();
    assert.doesNotMatch(html(frueh, 'smartNotifs'), /Deload startet/);
    // Ein Tipp: Deload sofort aktiv, danach beginnt Woche 1
    ctx.startDeload();
    assert.equal(ctx.deloadActive(), true);
    assert.equal(ctx.targetRIR(), 4);
    ctx.__harness.setNow('2026-10-18T08:00:00Z');
    assert.equal(ctx.deloadActive(), false);
    assert.equal(ctx.mesoWeek(), 1);
  });

  test('3 Nach dem Update (kein gespeicherter Zyklus): Woche 1, keine Deload-Karte', () => {
    // 8 Wochen Historie mit flachem E1RM – die alte Logik hätte "6-Wochen-Zyklus erreicht" gemeldet
    const dates = Array.from({ length: 16 }, (_, i) => new Date(Date.parse('2026-08-24T17:00:00Z') + i * 3.5 * DAY).toISOString().slice(0, 10));
    const hist = dates.map((d) => ({ ...session(d, BS, [[100, 8, 8], [100, 8, 8]]), sets: [
      { ex: BS, w: 100, r: 8, rpe: 8 }, { ex: 'Kniebeuge (LH)', w: 140, r: 6, rpe: 8 }, { ex: 'Rudern (LH Untergriff)', w: 80, r: 8, rpe: 8 }] }));
    const ctx = loadApp({ history: hist }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(ctx.mesoWeek(), 1);
    assert.equal(ctx.needsDeload(), null);
    ctx.renderSmartNotifs();
    assert.doesNotMatch(html(ctx, 'smartNotifs'), /Deload/);
    assert.ok(ctx.localStorage.getItem('kinetic.meso'), 'Zyklus wird gespeichert, damit er nicht bei jedem Start neu beginnt');
    assert.equal(ctx.buildBackupObject().state.meso.start, ctx.AppState.meso.start);
  });

  test('3 Planübernahme (3+1-Vorlage) startet den Zyklus neu', () => {
    const wochen = ['2026-09-08', '2026-09-15', '2026-09-22'];
    const ctx = loadApp({ meso: { start: MO('2026-09-07') }, history: train(wochen) }, { now: '2026-09-30T08:00:00Z' });
    assert.equal(ctx.mesoWeek(), 4);
    ctx.applyPlan3plus1();
    assert.equal(ctx.mesoWeek(), 1);
  });
}
