// feat/skip-redistribute – Übungen überspringen ohne Volumenloch
export const title = 'Überspringen · Umverteilung auf denselben Muskel';

const plain = (x) => JSON.parse(JSON.stringify(x));
const RDL = 'Rumänisches Kreuzheben (LH)';

// Lower aus plan3plus1 am Mittwoch starten, aktuelle Übung = name
function lowerAt(loadApp, name, extra = {}, now = '2026-10-28T08:00:00Z') {
  const PLAN = plain(loadApp({}).plan3plus1());
  const c = loadApp({ plan: PLAN, history: [], ...extra }, { now });
  c.startWorkout('wed');
  const s = c.AppState.activeSession;
  if (name) s.currentIdx = s.exercises.findIndex((e) => e.n === name);
  return { c, s };
}
const setsOf = (s, n) => s.exercises.find((e) => e.n === n).sets.length;

export default function ({ test, assert, loadApp }) {
  // ── 1 Überspringen-Button ──
  test('1 Button "Überspringen" mit Pflicht-Auswahl des Grundes, gespeichert als skipped', () => {
    const { c, s } = lowerAt(loadApp, RDL);
    c.renderWorkout();
    let html = c.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /id="skipBtn"/);
    assert.doesNotMatch(html, /data-skip-reason/);
    c.skipAskOpen();
    html = c.document.getElementById('workoutContent').innerHTML;
    for (const r of ['Mag ich nicht', 'Gerät belegt', 'Schmerz/Unwohlsein']) assert.match(html, new RegExp(`data-skip-reason="[a-z]+"[^>]*>${r.replace('/', '\\/')}<`));
    assert.equal(c.skipExercise(s.currentIdx, 'egal'), null, 'ohne gültigen Grund kein Überspringen');
    const idx = s.currentIdx;
    c.chooseSkipReason('pain');
    assert.deepEqual(plain(s.skipped), [{ ex: RDL, reason: 'pain', sets: 3 }]);
    assert.equal(s.exercises[idx].done, true);
    assert.equal(s.currentIdx, idx + 1, 'weiter zur nächsten Übung');
    // Beenden: skipped landet in der Historie, keine Sätze der übersprungenen Übung
    c.finishWorkout();
    const h = c.AppState.history[c.AppState.history.length - 1];
    assert.deepEqual(plain(h.skipped), [{ ex: RDL, reason: 'pain', sets: 3 }]);
    assert.ok(!h.sets.some((x) => x.ex === RDL));
  });
}
