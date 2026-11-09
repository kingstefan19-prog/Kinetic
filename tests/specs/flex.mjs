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

  // ── 3 Belastung, Erholung, Tagesvorschlag ──
  // Einheiten wie im Beispiel: Unterkörper, Oberkörper Druck, Oberkörper Zug; Fußball Mi + Fr, Spiel So
  const UNITS = [
    { id: 'push', type: 'gym', name: 'Oberkörper Druck', ex: [{ n: 'Bankdrücken (LH)', s: '4×6-8' }, { n: 'Schulterdrücken (KH sitzend)', s: '3×8-10' },
      { n: 'Seitheben (Kabel)', s: '3×12-15' }, { n: 'Trizeps Pushdown (Seil)', s: '3×10-12' }] },
    { id: 'legs', type: 'gym', name: 'Unterkörper', ex: [{ n: 'Kniebeuge (LH)', s: '4×5-8' }, { n: 'Rumänisches Kreuzheben (LH)', s: '3×8-10' },
      { n: 'Beinpresse', s: '3×10-12' }, { n: 'Wadenheben stehend', s: '3×10-15' }] },
    { id: 'pull', type: 'gym', name: 'Oberkörper Zug', ex: [{ n: 'Klimmzüge', s: '4×6-10' }, { n: 'Rudern (LH Untergriff)', s: '3×8-10' },
      { n: 'Latzug (Untergriff eng)', s: '3×10-12' }, { n: 'Bizeps Curl (LH)', s: '3×8-10' }] },
  ];
  const SCHEDULE = { appointments: [
    { id: 'fb', name: 'Fußballtraining', activity: 'soccer', weekdays: [2, 4], time: '19:00' },
    { id: 'sp', name: 'Spiel', activity: 'match', weekdays: [6], time: '15:00' }] };
  const gym = (iso, unit) => ({ ts: Date.parse(iso), dayName: unit.name, durationMs: 3e6, volume: 0,
    sets: unit.ex.flatMap((e) => Array.from({ length: +e.s[0] }, () => ({ ex: e.n, w: 50, r: 8, rpe: 8 }))) });
  const app = (state, now) => loadApp({ plan: plain(UNITS), schedule: plain(SCHEDULE), ...state }, { now });

  test('3 Belastung je Gruppe 0–3 aus den Sätzen; Aktivitäten anpassbar', () => {
    const c = app({}, '2026-11-09T08:00:00Z');
    assert.deepEqual(plain(c.unitLoad(UNITS[0])), { legs: 0, push: 3, pull: 0, core: 0 });
    assert.deepEqual(plain(c.unitLoad(UNITS[1])), { legs: 3, push: 0, pull: 0, core: 0 });
    assert.deepEqual(plain(c.unitLoad(UNITS[2])), { legs: 0, push: 0, pull: 3, core: 0 });
    assert.deepEqual(plain(c.activityLoad('match')), { legs: 3, push: 0, pull: 0, core: 2 });
    c.flexSchedule().activities.squash.load.legs = 1;
    assert.equal(c.activityLoad('squash').legs, 1);
  });

  test('3 Erholung aus der Historie: Stufe 3 = 72 h, linear; geplante Termine ohne Log zählen nicht', () => {
    // Spiel Sa 15:00 im Log, Mo 15:00 = 48 h → Beine 33 % ermüdet → 67 % erholt
    const c = app({ activityLog: [{ d: '2026-11-07', activity: 'match', time: '15:00' }] }, '2026-11-09T15:00:00');
    assert.equal(c.groupRecovery().legs, 67);
    assert.equal(c.groupRecovery().push, 100);
    // gleiche Woche ohne Log-Eintrag: das geplante Spiel zählt nicht
    assert.equal(app({}, '2026-11-09T15:00:00').groupRecovery().legs, 100);
    // Erholungszeit anpassbar
    const d = app({ activityLog: [{ d: '2026-11-07', activity: 'match', time: '15:00' }] }, '2026-11-09T15:00:00');
    d.flexSchedule().recoveryHours[3] = 96;
    assert.equal(d.groupRecovery().legs, 50);
  });

  test('3 Beispiel: "Beine: 49h seit Samstag, Fußballtraining erst Mittwoch" – Alternative Zug, da gestern Fokus Druck', () => {
    const c = app({ history: [gym('2026-11-08T10:00:00', UNITS[0])],                 // So Druck
      activityLog: [{ d: '2026-11-07', activity: 'match', time: '15:00' }] }, '2026-11-09T16:00:00');   // Sa Spiel, jetzt Mo 16 Uhr
    const r = c.flexSuggestion();
    assert.equal(r.kind, 'train');
    assert.equal(r.main.label, 'Unterkörper');
    assert.equal(r.main.reason, 'Beine: 49h seit Samstag, Fußballtraining erst Mittwoch, nächste Einheit der Rotation.');
    assert.equal(r.alt.label, 'Oberkörper Zug');
    assert.equal(r.alt.reason, 'da gestern Fokus Druck.');
    assert.ok(!r.candidates.find((x) => x.day.id === 'push') || r.candidates.find((x) => x.day.id === 'push').noMain, 'Druck nicht an zwei Folgetagen');
    c.renderTodayCard();
    const html = c.document.getElementById('todayCard').innerHTML;
    assert.match(html, /Heute: Unterkörper/);
    assert.match(html, /Alternative: <b[^>]*>Oberkörper Zug<\/b>, da gestern Fokus Druck\./);
    assert.match(html, /Beine 68 %/);
    assert.match(html, /id="flexStartAlt"/);
    assert.match(html, /Andere Einheit starten/);
    // Alternative mit einem Klick
    c.startFlexAlt();
    assert.equal(c.AppState.activeSession.dayName, 'Oberkörper Zug');
  });

  test('3 Beine Stufe 3 in < 48 h → Unterkörper nur leicht; am Spieltag kein Gym', () => {
    // Fr 10 Uhr, Spiel Sa (hier Sa-Termin), letzte Einheit Zug → Unterkörper wäre dran
    const sched = plain(SCHEDULE); sched.appointments[1].weekdays = [5]; sched.appointments[0].weekdays = [2];   // Fußball nur Mi
    const c = app({ schedule: sched, history: [gym('2026-11-12T10:00:00', UNITS[2])] }, '2026-11-13T10:00:00');
    const r = c.flexSuggestion();
    const legs = r.candidates.find((x) => x.day.id === 'legs');
    assert.equal(legs.variant, 'compact');
    assert.equal(legs.label, 'Unterkörper (leicht)');
    assert.notEqual(r.main.day.id, 'legs', 'abgewertet');
    assert.match(c.manualStartCheck(UNITS[1], null, '2026-11-13T10:00:00').hints.join(' '), /Spiel Samstag: Beine heute nur leicht/);
    const sa = app({ schedule: sched, history: [] }, '2026-11-14T09:00:00');
    assert.equal(sa.flexSuggestion().main.label, 'Heute: Spiel – kein Gym');
  });

  test('3 Ruhetag bei 3 belasteten Tagen am Stück oder allen Gruppen unter 60 %', () => {
    const c = app({ history: [gym('2026-11-06T10:00:00', UNITS[0]), gym('2026-11-07T10:00:00', UNITS[1]), gym('2026-11-08T10:00:00', UNITS[2])] }, '2026-11-09T10:00:00');
    const r = c.flexSuggestion();
    assert.equal(r.main.label, 'Ruhetag');
    assert.match(r.main.reason, /3 Tage am Stück belastet/);
    assert.equal(r.alt.label, 'Mobility');
    // alle Gruppen < 60 %: Squash-Last überall auf 3 gesetzt, gestern gespielt
    const d = app({ activityLog: [{ d: '2026-11-08', activity: 'squash', time: '18:00', load: { legs: 3, push: 3, pull: 3, core: 3 } }] }, '2026-11-09T10:00:00');
    assert.equal(d.flexSuggestion().main.label, 'Ruhetag');
    assert.match(d.flexSuggestion().main.reason, /Alle Gruppen unter 60 % erholt/);
  });

  test('3 Keine gleiche Muskelgruppe an zwei Folgetagen als Hauptempfehlung; Wochenziel 4 → Ruhetag', () => {
    for (const u of UNITS) {
      const c = app({ history: [gym('2026-11-08T10:00:00', u)] }, '2026-11-09T18:00:00');
      const r = c.flexSuggestion();
      if (r.main.kind === 'unit') assert.notEqual(r.main.day.id, u.id, u.name);
    }
    const four = app({ history: ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'].map((d, i) => gym(`${d}T08:00:00`, UNITS[i % 3])) }, '2026-11-14T10:00:00');
    assert.equal(four.flexSuggestion().main.label, 'Ruhetag');
    assert.match(four.flexSuggestion().main.reason, /Wochenziel erreicht \(4\/4/);
  });

  test('3 Einstellungen: Belastung 0–3 je Aktivität und Einheit, Erholungszeit und Wochenziel anpassbar', () => {
    const c = app({}, '2026-11-09T08:00:00Z');
    c.renderLoadSettings();
    let html = c.document.getElementById('loadSettings').innerHTML;
    assert.match(html, /data-load="gym:legs\|legs"/);
    assert.match(html, /data-load="match\|legs"[^>]*>(?:<option[^>]*>[0-3]<\/option>)*<option value="3" selected>/);
    assert.match(html, /data-rh="3" value="72"/);
    c.setActivityLoad('soccer', 'legs', 3);
    assert.equal(c.activityLoad('soccer').legs, 3);
    c.setActivityLoad('gym:pull', 'core', 2);
    assert.deepEqual(plain(c.unitLoad(UNITS[2])), { legs: 0, push: 0, pull: 3, core: 2 });
    c.resetUnitLoad('pull');
    assert.equal(c.unitLoad(UNITS[2]).core, 0);
    const k = c.addActivity('Laufen');
    assert.equal(c.flexSchedule().activities[k].name, 'Laufen');
    assert.equal(c.setRecoveryHours(3, 96), true);
    assert.equal(c.setRecoveryHours(3, 1000), false);
    assert.equal(c.flexSchedule().recoveryHours[3], 96);
    c.setWeekGoal('min', 4);
    assert.deepEqual(plain(c.flexSchedule().weekGoal), { min: 4, max: 4 });
  });

  // ── 4 Spontane Änderungen ──
  test('4 "Spiel ausgefallen, Oberkörper trainiert": Folgetag berücksichtigt das automatisch', () => {
    // So 08.11.: Spiel fällt aus, stattdessen Druck (ohne Satz-Log) eingetragen
    const c = app({}, '2026-11-08T20:00:00');
    assert.equal(c.unconfirmedAppointments(1).map((o) => o.appt.name).join(), 'Spiel', 'Startscreen: gestern und heute');
    assert.equal(c.unconfirmedAppointments(7).map((o) => o.appt.name).join(), 'Spiel,Fußballtraining,Fußballtraining,Spiel', 'Log-Tab: 7 Tage');
    c.renderTodayCard();
    assert.match(c.document.getElementById('todayCard').innerHTML, /So 15:00 Spiel – stattgefunden\?/);
    c.confirmAppointment('2026-11-08|sp', false);
    assert.equal(c.flexSchedule().cancelled['2026-11-08|sp'], true);
    assert.equal(c.unconfirmedAppointments(1).length, 0);
    c.logActivity('2026-11-08', 'gym:push');
    // Mo: Beine frisch (Spiel zählt nicht), Druck war gestern → nicht Hauptempfehlung
    c.__harness.setNow(Date.parse('2026-11-09T16:00:00'));
    const r = c.flexSuggestion();
    assert.equal(r.rec.legs, 100);
    assert.ok(r.rec.push < 100);
    assert.notEqual(r.main.day && r.main.day.id, 'push');
    assert.deepEqual(plain(r.yFocus), ['push']);
    assert.equal(c.nextRotationUnit().name, 'Unterkörper', 'gym:push zählt auch für die Rotation');
    // Log-Tab: Formular und Liste
    c.renderLog();
    const html = c.document.getElementById('activityLogCard').innerHTML;
    assert.match(html, /Tag eintragen/);
    assert.match(html, /<option value="gym:push">🏋️ Oberkörper Druck \(ohne Sätze\)/);
    assert.match(html, /08\.11\. · Oberkörper Druck/);
  });

  test('4 Stattgefundenen Termin bestätigen und Squash nachtragen; Löschen nimmt es wieder raus', () => {
    const c = app({}, '2026-11-11T21:00:00');                                    // Mi nach dem Training
    c.confirmAppointment('2026-11-11|fb', true);
    assert.equal(c.AppState.activityLog[0].apptKey, '2026-11-11|fb');
    assert.ok(c.groupRecovery().legs < 100);
    assert.equal(c.logActivity('2026-11-10', 'squash').activity, 'squash');
    assert.equal(c.logActivity('2026-11-10', 'gibtsnicht'), null);
    const before = c.groupRecovery().core;
    c.removeActivity(1);
    assert.ok(c.groupRecovery().core > before, 'Squash (Rumpf 2, 48 h) zählte mit');
    assert.equal(c.buildBackupObject().state.activityLog.length, 1);
  });
}
