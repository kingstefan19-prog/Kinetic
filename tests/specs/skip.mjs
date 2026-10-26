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

  // ── 2 Umverteilung ──
  test('2 Lower: RDL "Mag ich nicht" → Beinbeuger liegend 2 → 4 Sätze, Nordic und Beinstrecker unverändert', () => {
    const { c, s } = lowerAt(loadApp, RDL);
    const before = { nordic: setsOf(s, 'Nordic Curl (Beinbizeps)'), strecker: setsOf(s, 'Beinstrecker') };
    assert.equal(setsOf(s, 'Beinbeuger (Maschine liegend)'), 2);
    c.skipExercise(s.currentIdx, 'dislike');
    assert.equal(setsOf(s, 'Beinbeuger (Maschine liegend)'), 4);
    assert.equal(setsOf(s, 'Nordic Curl (Beinbizeps)'), before.nordic, 'Nordic nie aufstocken');
    assert.equal(setsOf(s, 'Beinstrecker'), before.strecker, 'nie auf andere Muskeln');
    assert.match(s.skipNotes[0], /^RDL übersprungen → Beinbeuger \+2 Sätze \(Hamstrings\)\./);
    // neue Sätze sind mit dem Coach-Vorschlag vorbelegt
    const bb = s.exercises.find((e) => e.n === 'Beinbeuger (Maschine liegend)');
    assert.equal(bb.sets[3].w, bb.sets[0].w);
    c.renderWorkout();
    assert.match(c.document.getElementById('workoutContent').innerHTML, /RDL übersprungen → Beinbeuger \+2 Sätze \(Hamstrings\)/);
  });

  test('2 Ohne passende Übung: Volumen offen → nächstes Training der Woche mit gleichem Muskel +2, nicht in der Folgewoche', () => {
    const PLAN = plain(loadApp({}).plan3plus1());
    const SK = 'Seitheben (Kabel)';
    // Mo Upper A: Seitheben (Kabel) ist dort die einzige Schulterübung
    const c = loadApp({ plan: plain(PLAN), history: [] }, { now: '2026-10-26T16:00:00Z' });
    c.startWorkout('mon');
    let s = c.AppState.activeSession;
    const before = plain(s.exercises.map((e) => [e.n, e.sets.length]));
    c.skipExercise(s.exercises.findIndex((e) => e.n === SK), 'dislike');
    assert.deepEqual(plain(s.exercises.filter((e) => e.n !== SK).map((e) => [e.n, e.sets.length])), before.filter((x) => x[0] !== SK), 'nichts auf andere Muskeln');
    assert.match(s.skipNotes[0], /^Seitheben übersprungen → heute keine passende Übung\. Volumen offen: 3 Sätze Schulter/);
    c.finishWorkout();
    assert.deepEqual(plain(c.weekQueue('2026-10-27T08:00:00Z').volOpen), { schulter: 3 });
    // Mi Lower (keine Schulter): nichts
    c.__harness.setNow('2026-10-28T16:00:00Z');
    c.startWorkout('wed');
    s = c.AppState.activeSession;
    assert.equal(s.volPaid, undefined);
    c.abortWorkout(); c.abortWorkout();
    // Sa Upper B: +2 Sätze, Dehnung zuerst (Seitheben am Kabel)
    c.__harness.setNow('2026-10-31T10:00:00Z');
    c.startWorkout('sat');
    s = c.AppState.activeSession;
    assert.equal(setsOf(s, SK), 5, 'Seitheben (Kabel) 3 → 5');
    assert.equal(setsOf(s, 'Schulterdrücken (KH sitzend)'), 3);
    assert.equal(setsOf(s, 'Face Pulls (Kabel)'), 2);
    assert.match(s.skipNotes.join(' '), /Volumen offen aus dieser Woche: Seitheben \+2 Sätze \(Schulter\)/);
    s.exercises.forEach((e) => e.sets.forEach((st) => { st.done = true; }));
    c.finishWorkout();
    assert.deepEqual(plain(c.weekQueue('2026-11-01T08:00:00Z').volOpen), { schulter: 1 });
    // Folgewoche: nichts übertragen
    c.__harness.setNow('2026-11-02T16:00:00Z');
    assert.deepEqual(plain(c.weekQueue().volOpen), {});
    c.startWorkout('mon');
    assert.equal(setsOf(c.AppState.activeSession, SK), 3);
    assert.equal(c.AppState.activeSession.volPaid, undefined);
  });

  test('2 Gewichtete Hamstring-Sätze pro Session nie über 10; sitzend vor liegend', () => {
    const day = { id: 'wed', type: 'gym', name: 'Lower', ex: [
      { n: RDL, s: '4×8-10' }, { n: 'Beinbeuger (Maschine liegend)', s: '3×10-12' },
      { n: 'Beinbeuger (Maschine sitzend)', s: '3×10-12' }, { n: 'Hip Thrust (LH)', s: '3×8-12' }] };
    const PLAN = plain(loadApp({}).plan3plus1()).map((d) => (d.id === 'wed' ? day : d));
    const c = loadApp({ plan: PLAN, history: [] }, { now: '2026-10-28T08:00:00Z' });
    c.startWorkout('wed');
    const s = c.AppState.activeSession;
    c.skipExercise(0, 'dislike');
    assert.ok(c.sessionMuscleSets(s, 'hams') <= 10, `hams ${c.sessionMuscleSets(s, 'hams')}`);
    assert.equal(setsOf(s, 'Beinbeuger (Maschine sitzend)'), 5, 'Dehnung zuerst');
    assert.equal(setsOf(s, 'Beinbeuger (Maschine liegend)'), 3, 'Grenze 10 erreicht');
    assert.deepEqual(plain(s.volOpen), { hams: 2 });
    // jede Übung des 3+1-Lower einzeln überspringen: nie über 10
    for (const name of plain(loadApp({}).plan3plus1()).find((d) => d.id === 'wed').ex.map((e) => e.n)) {
      for (const reason of ['dislike', 'busy']) {
        const { c: c2, s: s2 } = lowerAt(loadApp, name);
        c2.skipExercise(s2.currentIdx, reason);
        assert.ok(c2.sessionMuscleSets(s2, 'hams') <= 10, name);
      }
    }
  });
}
