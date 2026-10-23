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

  // ── 4 Ziel-RIR je Übungstyp ──
  const woche5 = () => loadApp({ meso: { start: MO('2026-09-07') }, history: train(['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']) },
    { now: '2026-10-07T08:00:00Z' });

  test('4 targetRIR in Woche 5: Kniebeuge (LH) = 1, Beinstrecker = 1, Seitheben (Kabel) = 0 im letzten Satz', () => {
    const ctx = woche5();
    assert.equal(ctx.mesoInfo().phase, 'Peak Week');
    assert.equal(ctx.targetRIR('Kniebeuge (LH)', true), 1, 'Grundübung nie unter RIR 1');
    assert.equal(ctx.targetRIR('Beinstrecker', true), 1, 'Bein-Isolation nie unter RIR 1');
    assert.equal(ctx.targetRIR('Seitheben (Kabel)', true), 0, 'Oberkörper-Isolation: letzter Satz RIR 0');
    assert.equal(ctx.targetRIR('Seitheben (Kabel)', false), 1, 'übrige Sätze RIR 1');
    for (const ex of ['Wadenheben stehend', 'Adduktionsmaschine (sitzend)', 'Abduktionsmaschine (sitzend)', 'Beinbeuger (Maschine liegend)', 'Bankdrücken (LH)', 'Klimmzüge'])
      assert.equal(ctx.targetRIR(ex, true), 1, ex);
    for (const ex of ['Pec Deck / Maschinen-Flys', 'Trizeps Pushdown (Seil)', 'Bizeps Curl (LH)', 'Face Pulls (Kabel)'])
      assert.equal(ctx.targetRIR(ex, true), 0, ex);
    // außerhalb der Peak Week kein RIR 0, im Deload RIR 4
    const w1 = loadApp({}, { now: '2026-10-07T08:00:00Z' });
    assert.equal(w1.targetRIR('Seitheben (Kabel)', true), 2);
    assert.equal(w1.targetRIR('Kniebeuge (LH)', true), 2);
  });

  test('4 Ziel-RIR immer aus targetRIR(): Plan-Notizen ohne "RIR x", Anzeige je Übung', () => {
    const ctx = woche5();
    ctx.AppState.plan = ctx.plan3plus1();
    ctx.renderPlan();
    const plan = html(ctx, 'planList');
    assert.doesNotMatch(plan, /RIR 2-3|>RIR 2 ·|· RIR 2</, 'feste RIR-Angaben aus den Notizen sind ausgeblendet');
    assert.match(plan, /Klimmzüge.*ab 4×10 Zusatzlast/s, 'restliche Notiz bleibt');
    assert.match(plan, /3×12-15<div[^>]*>RIR 1 · letzter Satz RIR 0<\/div>/, 'Seitheben in der Peak Week');
    assert.match(plan, /4×5-8<div[^>]*>RIR 1<\/div>/, 'Bankdrücken');
    assert.equal(ctx.AppState.plan[0].ex[0].note, 'RIR 2 · E1RM tracken', 'gespeicherte Notiz bleibt unverändert');
    // Workout-Kopf
    workout(ctx, [{ n: 'Seitheben (Kabel)', s: '3×12-15', sets: [{ w: '20', r: '', rpe: '', done: false }] }]);
    ctx.renderWorkout();
    assert.match(html(ctx), /RIR 1 · letzter Satz RIR 0 · Wo 5 · Peak Week/);
  });

  // ── 2 Anpassung innerhalb der Session ──
  const sess = (ctx, ex, coach, sets) => { workout(ctx, [{ n: ex, s: '4×5-8', coach, sets }]); return ctx.AppState.activeSession.exercises[0]; };
  const set = (w, r, rpe = '', extra = {}) => ({ w: String(w), r: String(r), rpe: rpe === '' ? '' : String(rpe), done: false, ...extra });

  test('2 RIR 1 bei Ziel-RIR 2 auf einem Arbeitssatz senkt die offenen Sätze um einen Schritt', () => {
    const ctx = loadApp({}, { now: '2026-10-21T17:00:00Z' });
    assert.equal(ctx.targetRIR(BS), 2);
    const cur = sess(ctx, BS, { weight: 80, reps: 8 }, [set(80, 8, 9), set(80, 8), set(80, 8), set(80, 8)]);
    assert.equal(ctx.toggleSetDone(0), 'done');
    assert.deepEqual(cur.sets.map((x) => x.w), ['80', '77.5', '77.5', '77.5']);
    ctx.renderWorkout();
    assert.match(html(ctx), /Satz 2\+ angepasst: 80 → 77,5 kg \(RIR 1 statt 2\)/);
    assert.match(html(ctx), /id="adjUndo"[^>]*>Rückgängig/);
    // nächster Satz bei 77,5 kg zählt weiter als Arbeitssatz (Referenz wird nachgeführt)
    cur.sets[1].rpe = '9';
    ctx.toggleSetDone(1);
    assert.deepEqual(cur.sets.map((x) => x.w), ['80', '77.5', '75', '75']);
    // Rückgängig nimmt die letzte Anpassung zurück
    ctx.undoAutoAdjust();
    assert.deepEqual(cur.sets.map((x) => x.w), ['80', '77.5', '77.5', '77.5']);
    ctx.renderWorkout();
    assert.doesNotMatch(html(ctx), /angepasst:/);
  });

  test('2 Zu leicht (RIR ≥ Ziel + 2) erhöht um einen Schritt; Ziel + 1 und Ziel ändern nichts; ohne RIR nichts', () => {
    const ctx = loadApp({}, { now: '2026-10-21T17:00:00Z' });
    let cur = sess(ctx, BS, { weight: 80, reps: 8 }, [set(80, 8, 6), set(80, 8), set(80, 8)]);
    ctx.toggleSetDone(0);
    assert.deepEqual(cur.sets.map((x) => x.w), ['80', '82.5', '82.5']);
    for (const rpe of ['7', '8', '']) {
      cur = sess(ctx, BS, { weight: 80, reps: 8 }, [set(80, 8, rpe), set(80, 8)]);
      ctx.toggleSetDone(0);
      assert.equal(cur.sets[1].w, '80', `RPE "${rpe}"`);
      assert.equal(ctx.AppState.activeSession.lastAdjust || null, null);
    }
  });

  test('2 Leichter Rampensatz (100 kg bei Arbeitsgewicht 110 kg) mit RIR 4 löst keine Anpassung aus', () => {
    const ctx = loadApp({}, { now: '2026-10-21T17:00:00Z' });
    const cur = sess(ctx, BS, { weight: 110, reps: 6 }, [set(100, 6, 6), set(110, 6), set(110, 6)]);
    ctx.toggleSetDone(0);
    assert.deepEqual(cur.sets.map((x) => x.w), ['100', '110', '110']);
    assert.equal(ctx.AppState.activeSession.lastAdjust || null, null);
  });

  test('2 Kurzhantel 14 kg: Anpassung ändert die Wdh, nicht das Gewicht', () => {
    const ctx = loadApp({}, { now: '2026-10-21T17:00:00Z' });
    const ex = 'Seitheben (KH)';
    assert.ok(ctx.plateStep(ex, 14) / 14 > 0.05);
    const cur = sess(ctx, ex, { weight: 14, reps: 12 }, [set(14, 12, 6), set(14, 12), set(14, 12)]);
    ctx.toggleSetDone(0);
    assert.deepEqual(cur.sets.map((x) => [x.w, x.r]), [['14', '12'], ['14', '13'], ['14', '13']]);
    ctx.renderWorkout();
    assert.match(html(ctx), /Satz 2\+ angepasst: 12 → 13 Wdh \(RIR 4 statt 2\)/);
    // deutlich zu schwer (RIR 0 bei Ziel 2) → −2 Wdh
    const c2 = sess(ctx, ex, { weight: 14, reps: 12 }, [set(14, 12, 10), set(14, 12)]);
    ctx.toggleSetDone(0);
    assert.equal(c2.sets[1].r, '10');
  });

  test('2 Ein Satz mit st.manual bleibt unverändert (Markierung beim eigenen Ändern)', () => {
    const ctx = loadApp({}, { now: '2026-10-21T17:00:00Z' });
    const cur = sess(ctx, BS, { weight: 80, reps: 8 }, [set(80, 8, 9), set(80, 8), set(85, 5, '', { manual: true }), set(80, 8)]);
    ctx.toggleSetDone(0);
    assert.deepEqual(cur.sets.map((x) => x.w), ['80', '77.5', '85', '77.5']);
    assert.equal(cur.sets[2].r, '5');
    // eigenes Ändern im Feld setzt manual (Quelltext-Prüfung des Eingabe-Handlers)
    assert.match(ctx.renderWorkout.toString(), /if\(f==='w'\|\|f==='add'\|\|f==='r'\) cur\.sets\[i\]\.manual=true/);
  });

  test('2 Körpergewicht passt Zusatzlast bzw. Wdh an, Zeitübungen nie', () => {
    const ctx = loadApp({ user: { name: 'Testathlet', weight: 100 } }, { now: '2026-10-21T17:00:00Z' });
    workout(ctx, [{ n: 'Klimmzüge', s: '4×6-10', coach: { weight: 105, add: 5, reps: 8 },
      sets: [{ w: '', add: '5', r: '8', rpe: '10', done: false }, { w: '', add: '5', r: '8', rpe: '', done: false }] }]);
    ctx.toggleSetDone(0);
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[1].add, '2.5');
    workout(ctx, [{ n: 'Klimmzüge', s: '4×6-10', coach: { weight: 100, add: 0, reps: 8 },
      sets: [{ w: '', add: '', r: '8', rpe: '9', done: false }, { w: '', add: '', r: '8', rpe: '', done: false }] }]);
    ctx.toggleSetDone(0);
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[1].r, '7', 'ohne Zusatzlast: Wdh −1');
    workout(ctx, [{ n: 'Plank', s: '3×60s', isTimed: true, sets: [{ secs: '60', rpe: '10', done: false }, { secs: '60', rpe: '', done: false }] }]);
    ctx.toggleSetDone(0);
    assert.equal(ctx.AppState.activeSession.lastAdjust || null, null);
  });

  test('2 RIR nachträglich am abgehakten Satz: wird ausgewertet, Korrektur ersetzt die vorige Anpassung', () => {
    const ctx = loadApp({}, { now: '2026-10-21T17:00:00Z' });
    const cur = sess(ctx, BS, { weight: 80, reps: 8 }, [set(80, 8), set(80, 8), set(80, 8)]);
    ctx.toggleSetDone(0);
    assert.equal(cur.sets[1].w, '80');
    ctx.setRirForSet(cur, 0, 1); ctx.autoAdjustAfterSet(cur, 0);
    assert.equal(cur.sets[1].w, '77.5');
    ctx.setRirForSet(cur, 0, 2); ctx.autoAdjustAfterSet(cur, 0);
    assert.equal(cur.sets[1].w, '80', 'RIR korrigiert auf Ziel → Anpassung zurückgenommen');
  });

  // ── 5 Kalibrierung in der Peak Week ──
  const peakWorkout = (ctx) => {
    const day = { id: 'mon', name: 'Upper A', ex: [{ n: BS, s: '3×5-8' }, { n: 'Seitheben (Kabel)', s: '3×12-15' }, { n: 'Trizeps Pushdown (Seil)', s: '3×10-12' }] };
    ctx.proceedWithWorkout('mon', day, false);
    const s = ctx.AppState.activeSession;
    const fill = (n, rows) => { s.exercises.find((e) => e.n === n).sets = rows.map(([w, r, rpe]) => ({ w: String(w), r: String(r), rpe: rpe == null ? '' : String(rpe), done: true })); };
    return { s, fill };
  };

  test('5 Peak Week: RIR-0-Satz der Oberkörper-Isolation kalibriert automatisch (Logik aus 4.3)', () => {
    const ctx = woche5();
    const { s, fill } = peakWorkout(ctx);
    assert.equal(s.peak, true);
    // Seitheben: 14 Wdh @ RIR 2 → erwartet 16 bei gleicher Last, RIR-0-Satz schafft 17 → +1
    fill('Seitheben (Kabel)', [[20, 14, 8], [20, 14, 8], [20, 17, 10]]);
    // Pushdown: 12 Wdh @ RIR 1 → erwartet 13, RIR-0-Satz (ohne Angabe = RIR 0) 15 → +2
    fill('Trizeps Pushdown (Seil)', [[50, 12, 9], [50, 12, 9], [50, 15, null]]);
    // Bankdrücken (Grundübung): letzter Satz RIR 1 – keine Kalibrierung
    fill(BS, [[100, 8, 9], [100, 8, 9], [100, 7, 9]]);
    ctx.finishWorkout();
    assert.equal(ctx.AppState.rpeOffset, 1.5, 'Ø aus +1 und +2');
    assert.equal(ctx.AppState.rpeCalib.ex, 'Seitheben (Kabel), Trizeps Pushdown (Seil)');
    assert.equal(ctx.AppState.rpeCalib.n, 2);
    const pd = ctx.AppState.history.at(-1).sets.filter((x) => x.ex === 'Trizeps Pushdown (Seil)');
    assert.equal(pd.at(-1).rpe, 10, 'RIR-0-Satz ohne Angabe = RIR 0');
    // gleicher Zeitstempel wie die AMRAP-Kalibrierung → 14 Tage Pause für die AMRAP-Karte (Varianz-Check bleibt)
    assert.equal(ctx.AppState.rpeCalib.ts, ctx.Date.now());
  });

  test('5 Peak Week: Satz mit RIR ≥ 1 kalibriert nicht; außerhalb der Peak Week keine Auto-Kalibrierung', () => {
    const ctx = woche5();
    const { fill } = peakWorkout(ctx);
    fill('Seitheben (Kabel)', [[20, 14, 8], [20, 14, 8], [20, 15, 9]]);
    fill('Trizeps Pushdown (Seil)', []);
    fill(BS, []);
    ctx.finishWorkout();
    assert.equal(ctx.AppState.rpeOffset, null);
    const w1 = loadApp({}, { now: '2026-10-07T08:00:00Z' });
    const p1 = peakWorkout(w1);
    assert.equal(p1.s.peak, undefined);
    p1.fill('Seitheben (Kabel)', [[20, 14, 8], [20, 14, 8], [20, 17, 10]]);
    w1.finishWorkout();
    assert.equal(w1.AppState.rpeOffset, null);
  });

  test('5 Peak Week im Workout: letzter Satz als R0 markiert, Hinweis nur bei Oberkörper-Isolation', () => {
    const ctx = woche5();
    const { s } = peakWorkout(ctx);
    s.currentIdx = 1;   // Seitheben
    ctx.renderWorkout();
    assert.match(html(ctx), /Peak Week – letzter Satz bis RIR 0/);
    assert.match(html(ctx), />R0<\/td>/);
    s.currentIdx = 0;   // Bankdrücken
    ctx.renderWorkout();
    assert.doesNotMatch(html(ctx), /Peak Week – letzter Satz/);
  });
}
