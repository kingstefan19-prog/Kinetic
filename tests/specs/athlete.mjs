// feat/athlete-mode – Athleten-Modus (docs/ATHLETE-SPEC.md)
export const title = 'Athleten-Modus · Ziel, Rollen, Vorgaben, Volumen, Fußball';

const plain = (x) => JSON.parse(JSON.stringify(x));

export default function ({ test, assert, loadApp }) {
  const PLAN = () => plain(loadApp({}).plan3plus1());

  // ── A1 Ziel-Schalter ──
  test('A1 Ohne Feld: Recomp; im Profil auf Athlet umschaltbar, gespeichert und im Backup', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-10T08:00:00Z' });
    assert.equal(c.trainingGoal(), 'recomp');
    assert.equal(c.isAthlete(), false);
    assert.equal(c.AppState.user.trainingGoal, undefined, 'kein Feld ohne Aktion');
    c.renderGoalSettings();
    assert.match(c.document.getElementById('goalSettings').innerHTML, /data-goal="athlete"/);
    assert.equal(c.setTrainingGoal('bodybuilding'), false);
    c.setTrainingGoal('athlete');
    assert.equal(c.isAthlete(), false, 'erst nach Bestätigung der Plan-Vorschau (A3)');
    c.confirmDialogOk();
    assert.equal(c.isAthlete(), true);
    assert.equal(c.buildBackupObject().state.user.trainingGoal, 'athlete');
    c.setTrainingGoal('recomp');
    assert.equal(c.trainingGoal(), 'recomp');
  });

  // ── A2 Übungsrollen ──
  test('A2 exerciseRole: Tabelle, Mehrgelenk = assist, Rest = iso, Override am Plan-Eintrag', () => {
    const c = loadApp({ plan: PLAN() });
    const r = (n, e) => c.exerciseRole(n, e);
    for (const n of ['Bankdrücken (LH)', 'Kniebeuge (LH)', 'Schrägbank Bankdrücken (LH)']) assert.equal(r(n), 'main-heavy', n);
    for (const n of ['Klimmzüge', 'Rudern (LH Untergriff)', 'Rumänisches Kreuzheben (LH)', 'Schulterdrücken (KH sitzend)']) assert.equal(r(n), 'main', n);
    for (const n of ['Nordic Curl (Beinbizeps)', 'Copenhagen Adduction', 'Wadenheben stehend']) assert.equal(r(n), 'prevent', n);
    for (const n of ['Beinpresse', 'Latzug (Untergriff eng)', 'Einarmiges KH-Rudern', 'Schrägbankdrücken (KH)']) assert.equal(r(n), 'assist', n);
    for (const n of ['Seitheben (Kabel)', 'Bizeps Curl (LH)', 'Trizeps Pushdown (Seil)', 'Beinstrecker', 'Face Pulls (Kabel)']) assert.equal(r(n), 'iso', n);
    assert.equal(r('Plank', { n: 'Plank', s: '3×45s', timed: true }), null);
    assert.equal(r('Beinpresse', { n: 'Beinpresse', s: '2×10-12', role: 'main' }), 'main');
    assert.equal(r('Beinpresse', { n: 'Beinpresse', s: '2×10-12', role: 'quatsch' }), 'assist');
    // jede Übung der Vorlage hat eine Rolle (außer Plank)
    for (const d of PLAN()) for (const e of d.ex || []) if (!/Plank/.test(e.n)) assert.ok(c.exerciseRole(e.n, e), e.n);
  });

  // ── A3 Vorgaben je Rolle und Umstellung ──
  const S = (iso, ex, rows, dn = 'Upper A') => ({ ts: Date.parse(iso), dayName: dn, durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) });

  test('A3 Vorschau alt → neu; Plan ändert sich erst nach Bestätigung, vorher Sicherung', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-10T08:00:00Z' });
    const pv = Object.fromEntries(c.athletePlanPreview().map((r) => [`${r.day}|${r.n}`, `${r.old} → ${r.neu}`]));
    assert.equal(pv['Upper A|Bankdrücken (LH)'], '4×5-8 → 4×3-6');
    assert.equal(pv['Upper A|Klimmzüge'], '4×6-10 → 4×5-8');
    assert.equal(pv['Upper A|Schrägbankdrücken (KH)'], '3×8-12 → 3×6-10');
    assert.equal(pv['Upper A|Rudern (LH Untergriff)'], '3×8-10 → 3×5-8');
    assert.equal(pv['Upper A|Seitheben (Kabel)'], '3×12-15 → 2×10-15');
    assert.equal(pv['Lower|Kniebeuge (LH)'], '3×5-8 → 4×3-6');
    assert.equal(pv['Lower|Beinpresse'], '2×10-12 → 2×6-10');
    assert.equal(pv['Lower|Nordic Curl (Beinbizeps)'], '2×4-6 → 2×4-8');
    assert.equal(pv['Lower|Copenhagen Adduction'], '2×20-30s → 2×20-30s');
    assert.equal(pv['Lower|Wadenheben stehend'], '3×10-15 → 3×8-12');
    assert.equal(pv['Upper B|Schrägbank Bankdrücken (LH)'], '3×6-8 → 4×3-6');
    c.setTrainingGoal('athlete');
    const dlg = c.document.getElementById('appDialog').innerHTML;
    assert.match(dlg, /Plan auf Athlet umstellen\?/);
    assert.match(dlg, /Bankdrücken \(LH\)[^]*?4×5-8 → <b>4×3-6<\/b>/);
    assert.equal(c.AppState.plan.find((d) => d.name === 'Upper A').ex[0].s, '4×5-8', 'unverändert vor Bestätigung');
    c.confirmDialogOk();
    const ua = c.AppState.plan.find((d) => d.name === 'Upper A').ex[0];
    assert.equal(ua.s, '4×3-6');
    assert.equal(ua.prevS, '4×5-8');
    assert.equal(c.DB.get('autoSnapshot').reason, 'pre-athlete');
    // gleicher Wdh-Bereich je Übung im ganzen Plan
    const seen = {};
    for (const d of c.AppState.plan) for (const e of d.ex || []) {
      const r = c.parseRepRange(e.s), k = r ? `${r.lo}-${r.hi}` : e.s;
      if (seen[e.n]) assert.equal(k, seen[e.n], e.n); else seen[e.n] = k;
    }
    // zurück auf Recomp: alte Bereiche nach Bestätigung
    c.setTrainingGoal('recomp');
    c.confirmDialogOk();
    assert.equal(c.AppState.plan.find((d) => d.name === 'Upper A').ex[0].s, '4×5-8');
    assert.equal(c.AppState.plan.find((d) => d.name === 'Upper A').ex[0].prevS, undefined);
  });

  test('A3 Ziel-RIR-Bereiche und kurze Pausen je Rolle; Recomp unverändert', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-10T08:00:00Z' });
    const recomp = { rir: c.targetRIR('Bankdrücken (LH)'), rest: c.restSecondsFor('Bankdrücken (LH)') };
    c.applyAthletePlan();
    assert.equal(c.targetRIR('Bankdrücken (LH)'), 2.5);
    assert.equal(c.targetRIRLabel('Bankdrücken (LH)'), 'RIR 2–3');
    assert.equal(c.targetRIRLabel('Beinpresse'), 'RIR 2');
    assert.equal(c.targetRIRLabel('Seitheben (Kabel)'), 'RIR 1–2');
    assert.deepEqual([150, 120, 90, 60, 90, 60].map(String),
      ['Kniebeuge (LH)', 'Klimmzüge', 'Beinpresse', 'Beinstrecker', 'Nordic Curl (Beinbizeps)', 'Wadenheben stehend'].map((n) => String(c.restSecondsFor(n))));
    c.AppState.user.trainingGoal = 'recomp';
    assert.deepEqual({ rir: c.targetRIR('Bankdrücken (LH)'), rest: c.restSecondsFor('Bankdrücken (LH)') }, recomp);
  });

  test('A3 Einstiegsgewicht: E1RM für die Mitte des Bereichs bei Ziel-RIR, abgerundet, ohne Steigerung', () => {
    const B = 'Bankdrücken (LH)';
    const c = loadApp({ plan: PLAN(), history: [S('2026-11-03T17:00:00Z', B, [[100, 8, 8], [100, 8, 8], [100, 8, 8], [100, 8, 8]])] },
      { now: '2026-11-10T08:00:00Z' });
    assert.ok(/\+/.test(c.coachSuggestion(B, '4×5-8').hint), 'Recomp: Obergrenze → Steigerung');
    c.applyAthletePlan();
    const e1 = c.currentE1rm(B);
    const r = c.coachSuggestion(B, '4×3-6');
    assert.equal(r.reps, 4);
    assert.equal(r.hint, 'Einstiegsgewicht, lieber zu leicht.');
    assert.ok(r.weight <= e1 / (1 + 6.5 / 30) && r.weight > e1 / (1 + 6.5 / 30) - 2.5, `${r.weight}`);
    assert.equal(r.weight % 2.5, 0);
    // nach der ersten Einheit im neuen Bereich normale Logik
    c.AppState.history.push(S('2026-11-10T17:00:00Z', B, [[r.weight, 6, 7.5], [r.weight, 6, 7.5], [r.weight, 6, 7.5], [r.weight, 6, 7.5]]));
    c.__harness.setNow(Date.parse('2026-11-12T08:00:00Z'));
    assert.notEqual(c.coachSuggestion(B, '4×3-6').hint, 'Einstiegsgewicht, lieber zu leicht.');
  });

  // ── A4 Volumen ──
  test('A4 Höchstens 60 Min und 20 Sätze: zuerst iso kürzen, dann assist, nie main', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-10T08:00:00Z' });
    const rows = c.athletePlanPreview().filter((r) => r.day === 'Upper B');
    c.applyAthletePlan();
    const ub = c.AppState.plan.find((d) => d.name === 'Upper B');
    const st = c.athleteDayStats(ub);
    assert.ok(st.sets <= 20 && st.min <= 60, JSON.stringify(st));
    for (const e of ub.ex) {
      const role = c.exerciseRole(e.n, e), n = +e.s[0];
      if (role === 'main-heavy') assert.equal(n, 4, e.n);
      if (role === 'main' || role === 'assist') assert.equal(n, 3, `${e.n} nicht gekürzt`);
      assert.ok(n >= 1);
    }
    assert.equal(rows.reduce((a, r) => a + +r.neu[0], 0), st.sets);
    for (const d of c.AppState.plan.filter((x) => x.type === 'gym')) {
      const s2 = c.athleteDayStats(d);
      assert.ok(s2.sets <= 20 && s2.min <= 60, `${d.name} ${JSON.stringify(s2)}`);
    }
    // Readiness < 65: 4 Sätze weniger, wieder zuerst iso
    const t = c.trimSession(ub, { maxSets: 16 });
    assert.equal(c.athleteDayStats(t).sets, 16);
    assert.ok(t.ex.filter((e) => c.isMainRole(c.exerciseRole(e.n, e))).every((e) => ub.ex.find((x) => x.n === e.n).s === e.s));
    // 45 Min eingestellt: Assistenz wird auch gekürzt, main nie
    c.setSessionMinutes(45);
    const t45 = c.trimSession(ub);
    assert.ok(c.athleteDayStats(t45).min <= 45 || t45.ex.every((e) => c.isMainRole(c.exerciseRole(e.n, e)) || c.exerciseRole(e.n, e) === 'prevent' || +e.s[0] === 1));
    assert.equal(t45.ex.find((e) => e.n === 'Schrägbank Bankdrücken (LH)').s, '4×3-6');
  });

  test('A4 Volumen: Warnung erst unter Erhalt (4 Sätze), keine Hinweise Richtung MAV', () => {
    const hist = ['2026-11-02', '2026-11-05'].map((d) => S(`${d}T17:00:00Z`, 'Bankdrücken (LH)', [[100, 5, 8], [100, 5, 8], [100, 5, 8]]));
    const c = loadApp({ plan: PLAN(), history: hist }, { now: '2026-11-10T08:00:00Z' });
    assert.ok(c.volumeProgressionAdvice().some((a) => /brust: unter MEV|Spielraum bis MAV/.test(a.msg)), 'Recomp wie bisher');
    c.AppState.user.trainingGoal = 'athlete';
    const adv = c.volumeProgressionAdvice();
    assert.ok(!adv.some((a) => /MEV|MAV/.test(a.msg)), JSON.stringify(adv.map((a) => a.msg)));
    assert.ok(!adv.some((a) => a.m === 'brust'), 'Brust ≥ 4 Sätze pro Woche: kein Hinweis');
    assert.ok(adv.some((a) => /unter Erhalt \(0\/4/.test(a.msg)));
  });

  // ── A5 Spielminuten ──
  test('A5 Spielminuten: ≥ 60 Stufe 3, 20–59 Stufe 2, < 20 Stufe 1, ohne Angabe Stufe 3', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-10T08:00:00Z' });
    const lvl = (m) => c.activityEntryLoad({ d: '2026-11-08', activity: 'match', minutes: m }).legs;
    assert.equal(lvl(90), 3); assert.equal(lvl(60), 3); assert.equal(lvl(45), 2); assert.equal(lvl(20), 2); assert.equal(lvl(15), 1);
    assert.equal(c.activityEntryLoad({ d: '2026-11-08', activity: 'match' }).legs, 3);
    // groupRecovery nutzt die Stufe: 30 Min Spiel So 15:00, Di 08:00 (41 h) → Stufe 2 (48 h) statt 3 (72 h)
    const at = (min) => {
      const d = loadApp({ plan: PLAN(), activityLog: [{ d: '2026-11-08', activity: 'match', time: '15:00', ...(min != null ? { minutes: min } : {}) }] }, { now: '2026-11-10T08:00:00' });
      return d.groupRecovery().legs;
    };
    assert.equal(at(null), 57);
    assert.equal(at(30), 85);
    assert.equal(at(10), 100);
    // eintragen und korrigieren
    c.logActivity('2026-11-08', 'match', { minutes: '35' });
    assert.equal(c.AppState.activityLog[0].minutes, 35);
    c.setActivityMinutes(0, '70');
    assert.equal(c.activityEntryLoad(c.AppState.activityLog[0]).legs, 3);
    c.renderLog();
    assert.match(c.document.getElementById('activityLogCard').innerHTML, /Spiel · 70 Min/);
  });

  // ── A6 Prävention ──
  const WINTER = { appointments: [
    { id: 'fb', name: 'Fußballtraining', activity: 'soccer', weekdays: [2, 4], time: '19:00' },
    { id: 'sp', name: 'Spiel', activity: 'match', weekdays: [6], time: '15:00' }] };
  const athleteApp = (state, now) => {
    const c = loadApp({ plan: PLAN(), schedule: plain(WINTER), ...state }, { now });
    c.applyAthletePlan();
    return c;
  };

  test('A6 Nicht 48 h vor Spiel und nicht 24 h vor Training: Nordic/Copenhagen heute herausgenommen', () => {
    const lower = (c) => c.AppState.plan.find((d) => d.name === 'Lower').id;
    // Di 10:00: Training Mi 19:00 in 33 h → erlaubt
    let c = athleteApp({}, '2026-11-10T10:00:00');
    c.startWorkout(lower(c));
    assert.ok(c.AppState.activeSession.exercises.some((e) => /Nordic/.test(e.n)), 'Di erlaubt');
    // Mi 08:00: Training heute 19:00 → nicht
    c = athleteApp({}, '2026-11-11T08:00:00');
    c.startWorkout(lower(c));
    const s = c.AppState.activeSession;
    assert.ok(!s.exercises.some((e) => /Nordic|Copenhagen/.test(e.n)));
    assert.ok(s.hints.some((h) => /Nordic Curl heute nicht: Fußballtraining in < 24 h/.test(h)), JSON.stringify(s.hints));
    // Fr 22:00 (nach dem Training): Spiel So 15:00 in 41 h → nicht
    c = athleteApp({}, '2026-11-13T22:00:00');
    assert.equal(c.preventBlocker().appt.name, 'Spiel');
    // So 20:00 nach dem Spiel: Training Mi → erlaubt
    c = athleteApp({}, '2026-11-15T20:00:00');
    assert.equal(c.preventBlocker(), null);
    // Recomp: nichts wird herausgenommen
    const r = loadApp({ plan: PLAN(), schedule: plain(WINTER) }, { now: '2026-11-11T08:00:00' });
    r.startWorkout(lower(r));
    assert.ok(r.AppState.activeSession.exercises.some((e) => /Nordic/.test(e.n)));
  });

  test('A6 Schmerz pausiert, "Mag ich nicht" ersetzt nicht dauerhaft, fehlende Prävention per Karte', () => {
    const N = 'Nordic Curl (Beinbizeps)';
    const c = athleteApp({}, '2026-11-10T10:00:00');
    const lowerId = c.AppState.plan.find((d) => d.name === 'Lower').id;
    c.startWorkout(lowerId);
    c.skipExercise(c.AppState.activeSession.exercises.findIndex((e) => e.n === N), 'pain');
    assert.ok(c.pausedEx()[N]);
    c.finishWorkout();
    c.startWorkout(lowerId);
    assert.ok(!c.AppState.activeSession.exercises.some((e) => e.n === N), 'pausiert');
    c.abortWorkout(); c.abortWorkout();
    c.renderSmartNotifs();
    assert.match(c.document.getElementById('smartNotifs').innerHTML, /resumePreventEx\('Nordic Curl \(Beinbizeps\)'\)[^>]*>Wieder aufnehmen/);
    c.resumePreventEx(N);
    assert.equal(c.pausedEx()[N], undefined);
    // zweimal "Mag ich nicht": keine Ersatz-Karte
    for (const d of ['2026-10-27', '2026-11-03']) c.AppState.history.push({ ts: Date.parse(`${d}T17:00:00Z`), dayName: 'Lower', durationMs: 1, volume: 0, sets: [], skipped: [{ ex: N, reason: 'dislike', sets: 2 }] });
    assert.equal(c.permanentReplaceSuggestion(), null);
    // fehlt Copenhagen: Karte, Einfügen erst nach Bestätigung (frischer Stand, wenig andere Karten)
    const f = athleteApp({}, '2026-11-10T10:00:00');
    const lower = f.AppState.plan.find((d) => d.name === 'Lower');
    lower.ex = lower.ex.filter((e) => !/Copenhagen/.test(e.n));
    assert.deepEqual(plain(f.missingPrevent()), ['Copenhagen Adduction']);
    f.renderSmartNotifs();
    assert.match(f.document.getElementById('smartNotifs').innerHTML, /Copenhagen Adduction einplanen\?/);
    f.addPreventEx('Copenhagen Adduction');
    assert.ok(!lower.ex.some((e) => /Copenhagen/.test(e.n)));
    f.confirmDialogOk();
    assert.ok(lower.ex.some((e) => e.n === 'Copenhagen Adduction' && e.s === '2×20-30s'));
  });

  // ── A7 Power-Primer ──
  test('A7 Primer bei Bein-Erholung ≥ 65 % und ohne Fußball in 3 h; abschaltbar; ohne Gewicht geloggt', () => {
    const idOf = (c, n) => c.AppState.plan.find((d) => d.name === n).id;
    // Di 10:00, Spiel So abgesagt (sonst zählt es automatisch, A9): frisch → Lower mit Sprüngen
    const ohneSpiel = { schedule: { ...plain(WINTER), cancelled: { '2026-11-08|sp': true } } };
    let c = athleteApp(ohneSpiel, '2026-11-10T10:00:00');
    c.startWorkout(idOf(c, 'Lower'));
    let s = c.AppState.activeSession;
    assert.equal(s.primer.kind, 'jump');
    c.renderWorkout();
    assert.match(c.document.getElementById('workoutContent').innerHTML, /Power-Primer[^]*3×3-5 Sprünge/);
    c.togglePrimerSet(0); c.togglePrimerSet(1);
    s.exercises.forEach((e) => e.sets.forEach((st) => { st.done = true; }));
    c.finishWorkout();
    const h = c.AppState.history[c.AppState.history.length - 1];
    assert.deepEqual(plain(h.primer), { kind: 'jump', sets: 2, reps: '3-5' });
    assert.ok(!h.sets.some((x) => /Sprung/.test(x.ex)), 'kein Arbeitssatz');
    // Oberkörper: explosive Liegestütze/Würfe
    c = athleteApp(ohneSpiel, '2026-11-10T10:00:00');
    c.startWorkout(idOf(c, 'Upper A'));
    assert.equal(c.AppState.activeSession.primer.kind, 'upper');
    // Mi 17:00: Fußball 19:00 in 2 h → weglassen mit Grund
    c = athleteApp({}, '2026-11-11T17:00:00');
    c.startWorkout(idOf(c, 'Upper A'));
    assert.equal(c.AppState.activeSession.primer, undefined);
    assert.ok(c.AppState.activeSession.hints.some((x) => /Fußballtraining in < 3 h – heute ohne Power-Primer/.test(x)));
    // Spiel gestern 90 Min → Beine < 65 % → weglassen
    c = athleteApp({ activityLog: [{ d: '2026-11-08', activity: 'match', time: '15:00', minutes: 90 }] }, '2026-11-09T10:00:00');
    assert.match(c.primerFor(c.AppState.plan.find((d) => d.name === 'Upper A')).skip, /^Beine \d+ % erholt/);
    // abgeschaltet bzw. Recomp: nie
    c = athleteApp(ohneSpiel, '2026-11-10T10:00:00');
    c.setPowerPrimer(false);
    assert.equal(c.primerFor(c.AppState.plan.find((d) => d.name === 'Lower')), null);
    const r = loadApp({ plan: PLAN() }, { now: '2026-11-10T10:00:00' });
    assert.equal(r.primerFor(r.AppState.plan.find((d) => d.name === 'Lower')), null);
  });

  // ── A8 Kennzahlen ──
  test('A8 Kraft-Karte: Hauptübungen zuerst mit E1RM/kg; Benchmarks nur eigener Trend', () => {
    const hist = [];
    for (const [d, k] of [['2026-09-14', 0], ['2026-10-12', 1], ['2026-11-09', 2]]) {
      hist.push(S(`${d}T17:00:00Z`, 'Kniebeuge (LH)', [[120 + 5 * k, 5, 8]], 'Lower'));
      hist.push(S(`${d}T17:00:00Z`, 'Beinpresse', [[250, 10, 8]], 'Lower'));
      hist.push(S(`${d}T18:00:00Z`, 'Bankdrücken (LH)', [[90 + 2.5 * k, 5, 8]], 'Upper A'));
    }
    const c = loadApp({ plan: PLAN(), history: hist, weightLog: [{ w: 90, d: '2026-09-01' }, { w: 88, d: '2026-11-01' }] }, { now: '2026-11-10T08:00:00Z' });
    c.applyAthletePlan();
    assert.equal(c.bodyWeightAt(Date.parse('2026-10-12T12:00:00Z')), 90);
    assert.equal(c.bodyWeightAt(Date.parse('2026-11-09T12:00:00Z')), 88);
    const t = c.relTrend('Kniebeuge (LH)', 8);
    const e1 = c.currentE1rm('Kniebeuge (LH)');
    assert.equal(t.rel, Math.round(e1 / 88 * 100) / 100);
    assert.ok(t.delta > 0);
    c.renderStrengthCard();
    const card = c.document.getElementById('strengthCard').innerHTML;
    assert.ok(card.indexOf('Bankdrücken (LH)') < card.indexOf('Beinpresse') && card.indexOf('Kniebeuge (LH)') < card.indexOf('Beinpresse'), 'Hauptübungen vor Beinpresse (höherer Absolutwert)');
    assert.match(card, /data-rel="1"[^>]*>\d,\d\d×KG/);
    c.renderBenchmarks();
    const b = c.document.getElementById('benchmarkList').innerHTML;
    assert.match(b, /Orientierung: dein eigener Trend/);
    assert.match(b, /Kniebeuge \(LH\)[^]*×KG[^]*seit 8 Wo/);
    assert.doesNotMatch(b, /Elite|Fortgeschritten/);
  });

  // ── A9 Fußball zählt automatisch ──
  test('A9 Ohne activityLog-Eintrag senkt ein vergangener Fußballtermin die Bein-Erholung, ein abgesagter nicht', () => {
    const c = loadApp({ plan: PLAN(), schedule: plain(WINTER) }, { now: '2026-11-12T08:00:00' });   // Do nach Training Mi 19:00
    assert.equal(c.AppState.activityLog.length, 0);
    const mit = c.groupRecovery().legs;
    assert.ok(mit < 100, `${mit}`);
    assert.equal(c.flexEvents().filter((e) => e.auto && e.ts > Date.parse('2026-11-05T00:00:00')).map((e) => e.label).join(), 'Fußballtraining,Spiel,Fußballtraining');
    c.confirmAppointment('2026-11-11|fb', false);
    assert.equal(c.groupRecovery().legs, 100);
    // eingetragen zählt nur einmal
    c.confirmAppointment('2026-11-11|fb', true);
    c.logActivity('2026-11-11', 'soccer', { time: '19:00' });
    assert.equal(c.flexEvents().filter((e) => e.key === 'soccer' && new Date(e.ts).getDate() === 11).length, 1);
    assert.equal(c.groupRecovery().legs, mit);
    // Spielminuten am automatisch gezählten Spiel (A5): 15 Min → Stufe 1
    const d = loadApp({ plan: PLAN(), schedule: plain(WINTER) }, { now: '2026-11-09T08:00:00' });
    const voll = d.groupRecovery().legs;
    d.setApptMinutes('2026-11-08|sp', 15);
    assert.ok(d.groupRecovery().legs > voll);
    d.renderTodayCard();
    assert.match(d.document.getElementById('todayCard').innerHTML, /✓ So 15:00 Spiel gezählt[^]*value="15" data-appt-min="2026-11-08\|sp"/);
  });

  // ── A10 Pausen ──
  test('A10 Zeitstempel je Satz; Hauptübung unter 90 s → Hinweis; Ø Pause nach dem Workout und im Log', () => {
    const c = athleteApp({}, '2026-11-10T10:00:00');
    const idA = c.AppState.plan.find((d) => d.name === 'Upper A').id;
    c.startWorkout(idA);
    const s = c.AppState.activeSession;
    const cur = s.exercises[0];
    assert.equal(cur.n, 'Bankdrücken (LH)');
    const t0 = Date.parse('2026-11-10T10:10:00');
    const tick = (sec) => c.__harness.setNow(t0 + sec * 1000);
    s.exercises.forEach((e) => e.sets.forEach((st) => { st.w = '60'; st.r = '5'; st.rpe = '7.5'; }));
    tick(0); c.toggleSetDone(0);
    assert.equal(cur.sets[0].ts, t0);
    tick(60); c.toggleSetDone(1);
    const toast = c.document.getElementById('toast').textContent;
    assert.match(toast, /Pause 1:00 – Ziel 2:30 für schwere Sätze/);
    tick(240); c.toggleSetDone(2);
    assert.doesNotMatch(c.document.getElementById('toast').textContent, /Pause 3:00/, '≥ 90 s: kein Hinweis');
    tick(400); c.toggleSetDone(3);
    // Isolation: kein Hinweis
    const iso = s.exercises.find((e) => e.n === 'Seitheben (Kabel)');
    s.currentIdx = s.exercises.indexOf(iso);
    tick(500); c.toggleSetDone(0); tick(520); c.toggleSetDone(1);
    assert.doesNotMatch(c.document.getElementById('toast').textContent, /Seitheben|Pause 0:20/);
    c.finishWorkout();
    const h = c.AppState.history[c.AppState.history.length - 1];
    assert.equal(h.sets.find((x) => x.ex === 'Bankdrücken (LH)').ts, t0);
    assert.deepEqual(plain(c.mainPauseStats(h.sets)), { avg: 133, target: 150 });
    assert.match(c.document.getElementById('toast').textContent, /Ø Pause Hauptübungen 2:13 \/ Ziel 2:30/);
    c.renderLog();
    assert.match(c.document.getElementById('logList').innerHTML, /data-pause="1"[^>]*>⏱ Ø Pause Hauptübungen 2:13 \/ Ziel 2:30/);
  });
}
