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
}
