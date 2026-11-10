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
}
