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
}
