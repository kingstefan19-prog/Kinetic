// feat/flex-planning – Termine, Rotation, Erholung, Tagesvorschlag
export const title = 'Flexible Planung · Termine, Rotation, Erholung, Vorschlag';

const plain = (x) => JSON.parse(JSON.stringify(x));

export default function ({ test, assert, loadApp }) {
  const PLAN = () => plain(loadApp({}).plan3plus1());

  // ── 1 Feste Termine ──
  test('1 Ohne schedule: Termine aus dem alten Wochenplan (Fußball Di/Fr, Spiel So)', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-09T08:00:00Z' });
    const appts = plain(c.flexSchedule().appointments);
    assert.deepEqual(appts.map((a) => [a.activity, a.weekdays]), [['soccer', [1, 4]], ['match', [6]]]);
    assert.equal(c.AppState.history.length, 0);
  });

  test('1 Termine anlegen, bearbeiten, löschen; einzelner Termin "fällt aus"', () => {
    const c = loadApp({ plan: PLAN() }, { now: '2026-11-09T08:00:00Z' });   // Montag
    const sch = c.flexSchedule();
    // Winterzeit: Fußball Mi + Fr
    const fb = sch.appointments.find((a) => a.activity === 'soccer');
    c.toggleApptWeekday(fb.id, 1); c.toggleApptWeekday(fb.id, 2);
    assert.deepEqual(plain(fb.weekdays), [2, 4]);
    assert.equal(c.updateAppointment(fb.id, 'time', '18:30'), true);
    assert.equal(c.updateAppointment(fb.id, 'time', 'abends'), false);
    // neuer Termin Squash Do
    const id = c.addAppointment();
    c.updateAppointment(id, 'name', 'Squash'); c.updateAppointment(id, 'activity', 'squash'); c.toggleApptWeekday(id, 3);
    let occ = c.appointmentOccurrences('2026-11-09T08:00:00Z', 7).map((o) => `${o.d} ${o.appt.name}`);
    assert.deepEqual(plain(occ), ['2026-11-11 Fußballtraining', '2026-11-12 Squash', '2026-11-13 Fußballtraining', '2026-11-15 Spiel']);
    // Mittwoch fällt aus
    c.toggleApptCancelled(`2026-11-11|${fb.id}`);
    occ = c.appointmentOccurrences('2026-11-09T08:00:00Z', 7);
    assert.equal(occ.find((o) => o.d === '2026-11-11').cancelled, true);
    c.renderApptSettings();
    const html = c.document.getElementById('apptSettings').innerHTML;
    assert.match(html, /line-through[^>]*>\s*<span>Mi 11\.11\. 18:30 · Fußballtraining/);
    assert.match(html, /findet statt/);
    // löschen erst nach Bestätigung im App-Dialog
    c.deleteAppointment(id);
    assert.ok(c.flexSchedule().appointments.some((a) => a.id === id));
    c.confirmDialogOk();
    assert.ok(!c.flexSchedule().appointments.some((a) => a.id === id));
    // gespeichert und im Backup
    const b = c.buildBackupObject();
    assert.deepEqual(plain(b.state.schedule.appointments.find((a) => a.id === fb.id).weekdays), [2, 4]);
    assert.equal(b.state.schedule.cancelled[`2026-11-11|${fb.id}`], true);
    const d = loadApp({}, { now: '2026-11-09T08:00:00Z' });
    d.applyBackupState(plain(b.state));
    assert.equal(d.flexSchedule().appointments.find((a) => a.id === fb.id).time, '18:30');
  });

  // ── 2 Rotation ──
  const sess = (date, name, plan) => ({ ts: Date.parse(`${date}T17:00:00Z`), dayName: name, durationMs: 3e6, volume: 0,
    sets: plan.find((d) => d.name === name).ex.filter((e) => !/\d+s/.test(e.s)).map((e) => ({ ex: e.n, w: 50, r: 8, rpe: 8 })) });

  test('2 Nächste Einheit folgt der zuletzt trainierten, unabhängig vom Wochentag', () => {
    const plan = PLAN();
    let c = loadApp({ plan: plain(plan) }, { now: '2026-11-09T08:00:00Z' });
    assert.deepEqual(plain(c.rotationUnits().map((d) => d.name)), ['Upper A', 'Lower', 'Arme + Schulter + Core', 'Upper B']);
    assert.equal(c.nextRotationUnit().name, 'Upper A', 'ohne Historie die erste');
    // Lower an einem Sonntag trainiert → als Nächstes Upper B (optionale Arme-Einheit übersprungen)
    c = loadApp({ plan: plain(plan), history: [sess('2026-11-08', 'Lower', plan)] }, { now: '2026-11-09T08:00:00Z' });
    assert.equal(c.nextRotationUnit().name, 'Upper B');
    c = loadApp({ plan: plain(plan), history: [sess('2026-11-08', 'Upper B', plan)] }, { now: '2026-11-09T08:00:00Z' });
    assert.equal(c.nextRotationUnit().name, 'Upper A', 'nach der letzten wieder die erste');
    // "Lower (kompakt)" zählt als Lower
    c = loadApp({ plan: plain(plan), history: [{ ...sess('2026-11-08', 'Lower', plan), dayName: 'Lower (kompakt)' }] }, { now: '2026-11-09T08:00:00Z' });
    assert.equal(c.nextRotationUnit().name, 'Upper B');
  });

  test('2 Reihenfolge mit ↑/↓ sortierbar; Plan-Tab zeigt die Rotation statt Wochentagen', () => {
    const plan = PLAN();
    const c = loadApp({ plan: plain(plan), history: [sess('2026-11-08', 'Upper A', plan)] }, { now: '2026-11-09T08:00:00Z' });
    // Upper B vor Lower ziehen: zwei Gym-Einheiten nach oben (Fußball-/Spieltage dazwischen zählen nicht)
    c.moveGymDay(c.AppState.plan.findIndex((d) => d.name === 'Upper B'), -1);
    c.moveGymDay(c.AppState.plan.findIndex((d) => d.name === 'Upper B'), -1);
    assert.deepEqual(plain(c.rotationUnits().map((d) => d.name)), ['Upper A', 'Upper B', 'Lower', 'Arme + Schulter + Core']);
    assert.equal(c.nextRotationUnit().name, 'Upper B');
    c.renderPlan();
    const html = c.document.getElementById('planList').innerHTML;
    assert.match(html, /1 · Upper A/);
    assert.match(html, /2 · Upper B<\/div>[\s\S]*?▶ Nächste Einheit/);
    assert.doesNotMatch(html, /Montag|Fußball Training|Fußball Spiel/);
    assert.equal(c.moveGymDay(c.AppState.plan.findIndex((d) => d.name === 'Upper A'), -1), false, 'erste bleibt erste');
  });
}
