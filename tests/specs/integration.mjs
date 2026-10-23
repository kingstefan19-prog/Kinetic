// fix/integration – Fehler, die erst im Zusammenspiel mit echter Historie auffallen
export const title = 'Integration · Schlaf, Pausen, Varianten, Startgewicht, Spieltag, realistische Historie';

const DAY = 864e5;
const plain = (x) => JSON.parse(JSON.stringify(x));
function session(date, ex, rows, dayName = 'Test') {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}

export default function ({ test, assert, loadApp, loadFixture }) {
  // ── 1 Altersgrenze für Schlaf, HRV und Ruhepuls ──
  test('1 Ein alter sleepLog-Eintrag (5 Monate, 6 h) erzeugt kein "Wenig Schlaf"', () => {
    const ctx = loadApp({ sleepLog: [{ h: 6, d: '2026-05-20' }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(ctx.recentSleepQuality(), null);
    assert.equal(ctx.recoveryStatus(), null);
    ctx.renderSmartNotifs();
    assert.doesNotMatch(ctx.document.getElementById('smartNotifs').innerHTML, /Wenig Schlaf|Schlafmangel/);
    // Einträge der letzten 3 Kalendertage zählen weiter
    const neu = loadApp({ sleepLog: [{ h: 6, d: '2026-05-20' }, { h: 6, d: '2026-10-19' }, { h: 6, d: '2026-10-20' }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(neu.recentSleepQuality().q, 'low');
    // vorgestern zählt, vor 3 Tagen nicht mehr
    assert.equal(loadApp({ sleepLog: [{ h: 6, d: '2026-10-19' }] }, { now: '2026-10-21T08:00:00Z' }).recentSleepQuality().q, 'low');
    assert.equal(loadApp({ sleepLog: [{ h: 6, d: '2026-10-18' }] }, { now: '2026-10-21T08:00:00Z' }).recentSleepQuality(), null);
  });

  test('1 HRV und Ruhepuls aus wearableLog nur aus den letzten 3 Kalendertagen', () => {
    const base = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((d) => ({ d, hrv: 60, rhr: 50 }));
    // letzter Wert vor 6 Wochen → kein Signal
    const alt = loadApp({ wearableLog: [...base, { d: '2026-09-06', hrv: 40, rhr: 60 }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(alt.hrvStatus(), null);
    assert.equal(alt.rhrStatus(), null);
    assert.equal(alt.recoveryStatus(), null);
    // gestern gemessen → wird gewertet (supprimierte HRV, erhöhter Ruhepuls)
    const neu = loadApp({ wearableLog: [...base, { d: '2026-10-20', hrv: 40, rhr: 60 }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(neu.hrvStatus().status, 'suppressed');
    assert.equal(neu.rhrStatus().status, 'elevated');
    assert.equal(neu.recoveryStatus().q, 'bad');
  });

  // ── 2 Pausen-Schwelle ──
  const BS = 'Bankdrücken (LH)';
  const bank = (date) => session(date, BS, [[110, 8, 8], [110, 8, 8], [110, 8, 8]]);

  test('2 layoffStatus: bis 21 Tage keine Pause, 22–28 gleiches Gewicht, 29–56 −10 %, darüber −20 %', () => {
    const at = (days) => {
      const ctx = loadApp({ history: [bank('2026-09-01')] }, { now: new Date(Date.parse('2026-09-01T17:00:00Z') + days * DAY).toISOString() });
      return { st: ctx.layoffStatus(BS), sug: ctx.coachSuggestion(BS, '4×5-8'), ctx };
    };
    for (const d of [10, 14, 21]) assert.equal(at(d).st, null, `${d} Tage`);
    assert.equal(at(14).sug.weight, 112.5, '14 Tage (ein verpasster Montag): normale Progression');
    assert.doesNotMatch(at(14).sug.hint, /Pause/);
    const d25 = at(25);
    assert.equal(d25.st.mod, 1);
    assert.equal(d25.sug.weight, 110, 'gleiches Gewicht, keine Steigerung');
    assert.doesNotMatch(d25.st.note, /RIR/, 'Pausen-Text nennt keine eigene RIR');
    assert.equal(at(40).st.mod, 0.9);
    assert.equal(at(40).sug.weight, 100);
    assert.equal(at(70).st.mod, 0.8);
  });

  test('2 Während einer Pause liefert targetRIR(exName) Ziel-RIR + 1', () => {
    const pause = loadApp({ history: [bank('2026-09-01')] }, { now: '2026-09-26T08:00:00Z' });   // 25 Tage
    assert.ok(pause.layoffStatus(BS));
    assert.equal(pause.targetRIR(BS), 3, 'Woche 1: RIR 2 + 1');
    const normal = loadApp({ history: [bank('2026-09-01')] }, { now: '2026-09-15T08:00:00Z' });   // 14 Tage
    assert.equal(normal.targetRIR(BS), 2);
  });

  test('2 Mesozyklus-Neustart nach > 14 Tagen bezieht sich weiter auf das gesamte Training', () => {
    const MO = (d) => Date.parse(`${d}T00:00:00`);
    // Gesamttraining lückenlos, nur Bankdrücken 14 Tage weg → kein Neustart
    const hist = [bank('2026-09-01'), session('2026-09-08', 'Beinstrecker', [[45, 12, 8]]), bank('2026-09-15')];
    const ctx = loadApp({ meso: { start: MO('2026-08-31') }, history: hist }, { now: '2026-09-16T08:00:00Z' });
    assert.equal(ctx.mesoWeek(), 3);
  });

  // ── 3 Varianten ──
  test('3 Seitheben (Kabel) letzte Woche: Seitheben (KH) nach 18 Wochen startet normal, nicht mit −20 %', () => {
    const hist = [session('2026-06-22', 'Seitheben (KH)', [[14, 12, 8], [14, 12, 8], [14, 11, 8]]),
      session('2026-10-14', 'Seitheben (Kabel)', [[20, 14, 8], [20, 13, 8]])];
    const ctx = loadApp({ history: hist }, { now: '2026-10-21T08:00:00Z' });
    assert.ok(ctx.isRelatedExercise('Seitheben (KH)', 'Seitheben (Kabel)'));
    assert.equal(ctx.layoffStatus('Seitheben (KH)'), null);
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.ok(r.weight >= 14, `Gewicht ${r.weight}`);
    assert.doesNotMatch(r.hint, /Pause|−20/);
    // ohne verwandte Übung: weiterhin −20 %
    const allein = loadApp({ history: [hist[0], session('2026-10-14', 'Beinpresse', [[200, 10, 8]])] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(allein.layoffStatus('Seitheben (KH)').mod, 0.8);
  });

  test('3 Gleicher Primärmuskel zählt ebenfalls; preLayoffRef ignoriert überbrückte Lücken', () => {
    assert.equal(loadApp({}).isRelatedExercise('Kabelflys (untere Rolle)', 'Bankdrücken (LH)'), true, 'beide Brust (w = 1)');
    assert.equal(loadApp({}).isRelatedExercise('Beinstrecker', 'Bankdrücken (LH)'), false);
    const SB = 'Schrägbankdrücken (KH)';
    const hist = [session('2026-09-01', SB, [[42, 9, 8], [42, 9, 8]]), session('2026-09-08', SB, [[42, 9, 8], [42, 9, 8]]),
      session('2026-09-20', 'Bankdrücken (LH)', [[100, 8, 8]]), session('2026-10-01', 'Bankdrücken (LH)', [[100, 8, 8]]),
      session('2026-10-07', SB, [[34, 10, 7], [34, 10, 7]])];
    const ctx = loadApp({ history: hist }, { now: '2026-10-10T08:00:00Z' });
    assert.equal(ctx.preLayoffRef(SB), null, 'Brust lief durchgehend weiter');
    assert.doesNotMatch(ctx.coachSuggestion(SB, '3×8-12').hint, /Vor der Pause/);
  });

  // ── 4 Autoreg-Hinweis ──
  test('4 Kein "Autoreg"-Hinweis mehr im Vorschlag, loadForReps() bleibt', () => {
    // Situation, die früher den Hinweis erzeugte: E1RM deutlich über dem Arbeitsgewicht
    const ctx = loadApp({ history: [session('2026-10-14', 'Kniebeuge (LH)', [[140, 6, 7], [140, 6, 7], [160, 5, 8]])] }, { now: '2026-10-21T08:00:00Z' });
    const r = ctx.coachSuggestion('Kniebeuge (LH)', '3×5-8');
    assert.doesNotMatch(r.hint, /Autoreg/);
    assert.equal(typeof ctx.loadForReps, 'function');
    assert.ok(ctx.loadForReps('Kniebeuge (LH)', 8, 2) > 0);
  });

  // ── 5 Startgewicht für neue Übungen ──
  test('5 Rumänisches Kreuzheben ohne Historie: 45 % des Kniebeugen-E1RM, gerundet auf plateStep', () => {
    const ctx = loadApp({ history: [session('2026-10-14', 'Kniebeuge (LH)', [[150, 5, 8], [150, 5, 8], [150, 5, 8]])] }, { now: '2026-10-21T08:00:00Z' });
    const RDL = 'Rumänisches Kreuzheben (LH)';
    const e1 = ctx.currentE1rm('Kniebeuge (LH)');
    const r = ctx.coachSuggestion(RDL, '3×8-10');
    const step = ctx.plateStep(RDL, r.weight);
    assert.ok(Math.abs(r.weight - e1 * 0.45) <= step / 2 + 1e-9, `${r.weight} vs 45 % von ${e1}`);
    assert.equal(Math.round(r.weight / step) * step, r.weight, 'Vielfaches von plateStep');
    assert.equal(r.reps, 8);
    assert.match(r.hint, /^Schätzung, erster Satz bei RIR 3/);
  });

  test('5 Andere Familien: 80 % der verwandten Übung mit gleichem Gerätetyp; sonst "Erstes Mal"', () => {
    const ctx = loadApp({ history: [session('2026-10-14', 'Hammer Curl (KH)', [[18, 12, 8], [18, 12, 8], [18, 11, 8]]),
      session('2026-10-14', 'Seitheben (Kabel)', [[20, 14, 8]]), session('2026-10-14', 'Schulterdrücken (KH sitzend)', [[32, 9, 8]])] },
      { now: '2026-10-21T08:00:00Z' });
    const curl = ctx.coachSuggestion('Incline Curl (KH) 45°', '3×12-15');
    assert.equal(curl.weight, 14, '80 % von 18 kg = 14,4 → 14 (KH-Schritt 2 kg)');
    assert.match(curl.hint, /80 % von Hammer Curl \(KH\)/);
    // Seitheben (KH): Kabel ist anderer Gerätetyp, Schulterdrücken andere Familie → keine Schätzung
    const sh = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.equal(sh.weight, null);
    assert.match(sh.hint, /^Erstes Mal/);
    // Nordic Curl und Copenhagen Adduction ohne Gewicht
    assert.equal(ctx.coachSuggestion('Nordic Curl (Beinbizeps)', '2×4-6').weight, null);
    assert.equal(ctx.coachSuggestion('Copenhagen Adduction', '2×20-30s').weight, null);
  });

  // ── 6 Kein Nachholen am Spieltag ──
  test('6 Spieltag: Empfehlung "Kein Gym – Spieltag", Restwochen-Hinweis vom Samstag passt dazu', () => {
    const PLAN = plain(loadApp({}).plan3plus1());
    const sess = (date, name) => ({ ts: Date.parse(`${date}T17:00:00Z`), dayName: name, durationMs: 3e6, volume: 0,
      sets: PLAN.find((d) => d.name === name).ex.filter((e) => !e.timed).map((e) => ({ ex: e.n, w: 50, r: 8, rpe: 8 })) });
    const hist = [sess('2026-10-21', 'Lower')];   // Upper A (Mo) verpasst
    const sa = loadApp({ plan: plain(PLAN), history: hist }, { now: '2026-10-24T08:00:00Z' });
    assert.equal(sa.recommendedDay().label, 'Upper B');
    assert.equal(sa.restWeekNotice(), 'Diese Woche nur noch 1 von 2: Upper B, Upper A entfällt.');
    const so = loadApp({ plan: plain(PLAN), history: [...hist, sess('2026-10-24', 'Upper B')] }, { now: '2026-10-25T08:00:00Z' });
    const r = so.recommendedDay();
    assert.equal(r.kind, 'rest');
    assert.equal(r.label, 'Kein Gym – Spieltag');
    assert.equal(r.schedule.assign.length, 0);
    assert.match(so.restWeekNotice(), /Upper A entfällt/);
    // Fußball-Training (soccer) bleibt für Oberkörper erlaubt
    const di = loadApp({ plan: plain(PLAN), history: [] }, { now: '2026-10-20T08:00:00Z' });
    assert.equal(di.recommendedDay().label, 'Upper A');
  });

  test('6 Manueller Start am Spieltag bleibt möglich, mit Hinweis "Spieltag: Glykogen zuerst auffüllen"', () => {
    const PLAN = plain(loadApp({}).plan3plus1());
    const ctx = loadApp({ plan: plain(PLAN), history: [] }, { now: '2026-10-25T08:00:00Z' });
    ctx.startWorkout(ctx.AppState.plan.find((d) => d.name === 'Upper B').id);
    const s = ctx.AppState.activeSession;
    assert.ok(s, 'keine Sperre');
    assert.equal(s.hints[0], 'Spieltag: Glykogen zuerst auffüllen');
    assert.match(ctx.document.getElementById('toast').textContent, /Spieltag: Glykogen zuerst auffüllen/);
  });

  // ── 7 Realistischer Integrationstest (Fixture realistic-3plus1) ──
  const FX = 'realistic-3plus1';
  const fxAt = (date, extra = []) => {
    const f = plain(loadFixture(FX));
    const nowMs = Date.parse(`${date}T06:00:00Z`);
    f.state.history = f.state.history.filter((x) => x.ts < nowMs).concat(extra);
    return loadApp(f, { now: nowMs });
  };
  // Vorschläge für alle Planübungen an jedem Trainingstag (vor dem Training) und am Ende
  const SWEEP = (() => {
    const fx = loadFixture(FX);
    const dates = [...new Set(fx.state.history.map((x) => new Date(x.ts).toISOString().slice(0, 10)))];
    const out = [];
    for (const date of [...dates.slice(1), '2026-10-26']) {
      const c = fxAt(date);
      const logged = new Set(c.AppState.history.flatMap((x) => x.sets.map((y) => y.ex)));
      for (const day of c.AppState.plan) for (const e of day.ex || []) {
        const sug = plain(c.coachSuggestion(e.n, e.s));
        const bw = c.equipmentType(e.n) === 'bodyweight';
        // Körpergewichtsübungen: Raster gilt für die Zusatzlast, nicht für Körpergewicht + Zusatz
        const load = bw ? sug.add : sug.weight;
        out.push({ date, day: day.name, e, sug, logged: logged.has(e.n), bw, load,
          step: typeof load === 'number' ? c.plateStep(e.n, load) : null });
      }
    }
    return out;
  })();
  const where = (x) => `${x.date} ${x.e.n}: ${JSON.stringify(x.sug)}`;

  test('7 Fixture: synthetisch, plan3plus1, 10 Wochen, Woche 7 ohne Upper A', () => {
    const fx = loadFixture(FX);
    assert.equal(fx._fixture.synthetic, true);
    assert.deepEqual(plain(fx.state.plan), plain(loadApp({}).plan3plus1()));
    const days = fx.state.history.map((x) => new Date(x.ts).toISOString().slice(0, 10) + ' ' + x.dayName);
    assert.equal(fx.state.history.length, 30, '10 × 3 − 1 ausgefallene + 1 alte Seitheben-Session');
    assert.ok(!days.includes('2026-09-28 Upper A'), 'Woche 7: Upper A fällt aus');
    assert.ok(days.includes('2026-10-24 Upper B'));
    assert.equal(fx.state.sleepLog.length, 1);
    assert.ok(SWEEP.length > 600, `Sweep zu klein: ${SWEEP.length}`);
  });

  test('7 Kein Vorschlag enthält "Wenig Schlaf" (einziger sleepLog-Eintrag 20 Wochen alt)', () => {
    const c = loadApp(loadFixture(FX));
    assert.equal(c.recentSleepQuality(), null);
    assert.equal(c.recoveryStatus(), null);
    for (const x of SWEEP) assert.doesNotMatch(x.sug.hint || '', /Wenig Schlaf|😴/, where(x));
  });

  test('7 Bankdrücken nach verpasstem Montag (14 Tage): normale Progression, kein Pausenhinweis', () => {
    const c = fxAt('2026-10-05');
    const B = 'Bankdrücken (LH)';
    const lastB = c.AppState.history.filter((x) => x.sets.some((y) => y.ex === B)).pop();
    assert.equal(new Date(lastB.ts).toISOString().slice(0, 10), '2026-09-21', 'letztes Bankdrücken 14 Tage vorher');
    assert.equal(c.layoffStatus(B), null);
    const r = c.coachSuggestion(B, '4×5-8');
    assert.ok(r.weight >= 107.5, `${r.weight} kg unter dem letzten Arbeitsgewicht`);
    assert.doesNotMatch(r.hint, /Pause|⏸️|Wiedereinstieg|−\d+ ?%/);
    assert.equal(c.targetRIR(B), fxAt('2026-09-21').targetRIR(B), 'Ziel-RIR ohne Pausen-Aufschlag');
  });

  test('7 Seitheben (KH) nach 18 Wochen: kein −20 %, weil Seitheben (Kabel) läuft', () => {
    const c = loadApp(loadFixture(FX));
    const S = 'Seitheben (KH)';
    assert.ok(c.daysSinceExercise(S) > 120);
    assert.equal(c.layoffStatus(S), null);
    const r = c.coachSuggestion(S, '3×12-15');
    assert.equal(r.weight, 14, 'Arbeitsgewicht von vor 18 Wochen, nicht 14 × 0,8');
    assert.doesNotMatch(r.hint, /⏸️|−20|Pause/);
  });

  test('7 Kein Vorschlag enthält "Autoreg"', () => {
    for (const x of SWEEP) assert.doesNotMatch(x.sug.hint || '', /Autoreg/, where(x));
  });

  test('7 Rumänisches Kreuzheben ohne Historie: ca. 45 % des Kniebeugen-E1RM', () => {
    const c = loadApp(loadFixture(FX));
    const RDL = 'Rumänisches Kreuzheben (LH)';
    const e1 = c.currentE1rm('Kniebeuge (LH)');
    assert.ok(e1 > 180, `Kniebeugen-E1RM ${e1}`);
    const r = c.coachSuggestion(RDL, '3×8-10');
    assert.equal(r.estimate, true);
    assert.ok(Math.abs(r.weight - e1 * 0.45) <= c.plateStep(RDL, r.weight) / 2 + 1e-9, `${r.weight} vs 45 % von ${e1}`);
    // ab der ersten Kniebeugen-Session (Mi, Woche 1) immer eine Schätzung
    for (const x of SWEEP.filter((y) => y.e.n === RDL && y.date > '2026-08-19')) assert.equal(x.sug.estimate, true, where(x));
  });

  test('7 Invarianten: kein NaN, Gewicht bei Übungen mit Historie, Vielfaches von plateStep', () => {
    for (const x of SWEEP) {
      const json = JSON.stringify(x.sug);
      assert.doesNotMatch(json, /NaN|undefined|Infinity/, where(x));
      assert.equal(typeof x.sug.hint, 'string', where(x));
      if (x.logged && !x.e.timed && !x.bw) assert.ok(typeof x.sug.weight === 'number' && x.sug.weight > 0, `Gewicht fehlt – ${where(x)}`);
      if (typeof x.load === 'number' && x.load > 0) {
        const k = x.load / x.step;
        assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `kein Vielfaches von ${x.step} – ${where(x)}`);
      }
    }
    // Schlechter Kniebeugen-Tag (Woche 9): −7 % auf den Gewichtsschritt gerundet (150 → 140, nicht 139,5)
    const sq = SWEEP.find((x) => x.date === '2026-10-21' && x.e.n === 'Kniebeuge (LH)');
    assert.equal(sq.sug.weight, 140, where(sq));
    assert.match(sq.sug.hint, /−7% Deload/);
    // Zeitübung mit Historie: kein Gewicht und kein falscher Deload (25 s liegen im Ziel 20–30 s)
    for (const x of SWEEP.filter((y) => y.e.timed && y.logged)) {
      assert.equal(x.sug.weight, null, where(x));
      assert.doesNotMatch(x.sug.hint, /Deload|unter Wdh-Ziel/, where(x));
    }
  });

  test('7 Woche fällt bis Freitag aus: Sa Upper B, So kein Gym, Restwochen-Hinweis nennt Upper A und Lower', () => {
    const sa = fxAt('2026-10-31');
    assert.equal(sa.AppState.history.filter((x) => x.ts >= Date.parse('2026-10-26T00:00:00Z')).length, 0);
    const r = sa.recommendedDay();
    assert.equal(r.kind, 'train');
    assert.equal(r.label, 'Upper B');
    assert.equal(sa.restWeekNotice(), 'Diese Woche nur noch 1 von 3: Upper B, Upper A und Lower entfallen.');
    // Sonntag (Spiel), egal ob Upper B am Samstag gemacht wurde
    const PLAN = loadFixture(FX).state.plan;
    const upperB = { ts: Date.parse('2026-10-31T10:00:00Z'), dayName: 'Upper B', durationMs: 3e6, volume: 0,
      sets: PLAN.find((d) => d.name === 'Upper B').ex.map((e) => ({ ex: e.n, w: 50, r: 8, rpe: 8 })) };
    for (const so of [fxAt('2026-11-01'), fxAt('2026-11-01', [upperB])]) {
      const s = so.recommendedDay();
      assert.equal(s.kind, 'rest');
      assert.equal(s.label, 'Kein Gym – Spieltag');
      assert.equal(s.schedule.assign.length, 0);
      assert.match(so.restWeekNotice(), /Upper A und Lower entfallen|Upper A, Lower und Upper B entfallen/);
    }
  });
}
