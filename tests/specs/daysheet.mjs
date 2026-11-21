// feat/day-sheet – Tagesblatt, Termin-Absage auf Heute, Termine im Plan-Tab,
// Belastung nach Session-RPE (Foster), Deload-Fehlalarm
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Tagesblatt · Termine, Aktivitäten, sRPE-Belastung, Stagnation';

const plain = (x) => JSON.parse(JSON.stringify(x));

// Mi = 2, Fr = 4, So = 6 (0 = Montag)
const SCHED = () => ({ appointments: [
  { id: 'tr', name: 'Fußballtraining', activity: 'soccer', weekdays: [2, 4], time: '19:00' },
  { id: 'sp', name: 'Spiel', activity: 'match', weekdays: [6], time: '15:00' },
] });

export default function ({ test, assert, loadApp, REPO_ROOT }) {
  // Woche Mo 16.11. – So 22.11.2026; "jetzt" = Freitag 20.11. 10:00
  const NOW = '2026-11-20T10:00:00';
  const app = (state = {}, now = NOW) => loadApp({ schedule: SCHED(), ...state }, { now });
  const sheet = (c) => c.document.getElementById('appDialog').innerHTML;

  test('1 Wochenleiste: Tage sind antippbar und öffnen das Tagesblatt', () => {
    const c = app();
    c.renderWeekStrip();
    const h = c.document.getElementById('weekStrip').innerHTML;
    assert.equal((h.match(/<button type="button" class="wday/g) || []).length, 7);
    assert.match(h, /data-day="2026-11-18" onclick="openDaySheet\('2026-11-18'\)"/);
    assert.ok(c.openDaySheet('2026-11-18'));
    assert.match(sheet(c), /Mittwoch, 18\.11\./);
    assert.match(sheet(c), /19:00 Fußballtraining<\/b> · fand statt/);
    assert.equal(c.openDaySheet('kein-datum'), false);
  });

  test('1 Termin am Mittwoch "fiel aus" → zählt nicht in flexEvents(), Wochenleiste ohne Haken', () => {
    const c = app();
    const key = '2026-11-18|tr';
    assert.ok(c.flexEvents().some((e) => e.ref.o === key), 'vorher automatisch gezählt');
    c.openDaySheet('2026-11-18');
    c.daySheetAppt(key, false);
    assert.equal(c.flexEvents().some((e) => e.ref.o === key), false);
    assert.match(sheet(c), /fiel aus/);
    c.renderWeekStrip();
    const mi = c.document.getElementById('weekStrip').innerHTML.match(/<button[^>]*data-day="2026-11-18"[\s\S]*?<\/button>/)[0];
    assert.doesNotMatch(mi, /✓/);
    // zurücknehmen: "fand statt"
    c.daySheetAppt(key, true);
    assert.ok(c.flexEvents().some((e) => e.ref.o === key));
  });

  test('1 Aktivität eintragen (Dauer, Härte) und löschen; zukünftige Tage nur Termine absagen', () => {
    const c = app();
    c.openDaySheet('2026-11-19');
    assert.match(sheet(c), /data-ds-kind="squash"/);
    c.daySheetSet('key', 'squash'); c.daySheetSet('min', '75'); c.daySheetSet('rpe', 8);
    const e = c.daySheetSave();
    assert.deepEqual(plain(e), { d: '2026-11-19', activity: 'squash', minutes: 75, rpe: 8 });
    assert.match(sheet(c), /Squash 75 Min · Härte 8 → Beine Stufe/);
    const i = c.AppState.activityLog.length - 1;
    c.daySheetRemove(i);
    assert.equal(c.AppState.activityLog.length, 0);
    // Zukunft (Sonntag): kein Formular, Termin absagen möglich
    c.openDaySheet('2026-11-22');
    const h = sheet(c);
    assert.doesNotMatch(h, /data-ds-kind=|id="dsSave"/);
    assert.match(h, /data-ds-appt-toggle="2026-11-22\|sp"[^>]*>fällt aus</);
    c.daySheetToggle('2026-11-22|sp');
    assert.equal(c.flexSchedule().cancelled['2026-11-22|sp'], true);
    assert.match(sheet(c), />findet statt</);
    c._daySheet.key = 'squash';
    assert.equal(c.daySheetSave(), null, 'Zukunft: nichts eintragen');
    // kein confirm()/alert()/prompt() im Tagesblatt
    const src = c.daySheetHtml.toString() + c.renderDaySheet.toString();
    assert.doesNotMatch(src, /\b(confirm|alert|prompt)\(/);
  });

  test('2 Spiel heute "fällt aus" → Heute-Karte zeigt sofort ein Gym-Training statt "kein Gym"', () => {
    // Sonntag 22.11. 09:00, Spiel um 15:00
    const plan = [
      { id: 'ua', type: 'gym', name: 'Upper A', ex: [{ n: 'Bankdrücken (LH)', s: '4×5-8' }, { n: 'Klimmzüge', s: '4×6-10' }] },
      { id: 'lo', type: 'gym', name: 'Lower', ex: [{ n: 'Kniebeuge (LH)', s: '4×5-8' }] },
      { id: 'ub', type: 'gym', name: 'Upper B', ex: [{ n: 'Schulterdrücken (KH sitzend)', s: '3×8-12' }, { n: 'Latzug (Untergriff eng)', s: '3×8-12' }] },
    ];
    const c = app({ plan }, '2026-11-22T09:00:00');
    let r = c.flexSuggestion();
    assert.equal(r.main.kind, 'appointment');
    assert.match(r.main.label, /Spiel – kein Gym/);
    c.renderTodayCard();
    const card = () => c.document.getElementById('todayCard').innerHTML;
    assert.match(card(), /data-cancel-today="2026-11-22\|sp"[^>]*>Spiel fällt heute aus</);
    assert.ok(c.cancelTodayAppt('2026-11-22|sp'));
    r = c.flexSuggestion();
    assert.equal(r.main.kind, 'unit', 'normale Empfehlung');
    assert.match(card(), /Heute: (Upper A|Lower|Upper B)/);
    assert.doesNotMatch(card(), /kein Gym|fällt heute aus/);
    assert.equal(c.cancelTodayAppt('2026-11-25|tr'), false, 'nur Termine von heute');
  });

  test('3 Feste Termine im Plan-Tab (Menü ⋯ → Termine & Aktivitäten), nicht mehr im Profil', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    const sec = (id) => { const i = src.indexOf('<section id="page-' + id + '"'); return src.slice(i, src.indexOf('</section>', i)); };
    assert.equal((src.match(/id="apptSettings"/g) || []).length, 1);
    assert.match(sec('plan'), /id="apptSettings"/);
    assert.doesNotMatch(sec('data'), /apptSettings|Feste Termine/);
    assert.doesNotMatch(sec('ern'), /apptSettings|Feste Termine/);
    const menu = sec('plan').slice(sec('plan').indexOf('<details class="pmenu"'), sec('plan').indexOf('</details>'));
    assert.match(menu, /onclick="openPlanAppts\(\)">📅 Termine & Aktivitäten</);
    assert.match(sec('plan'), /<div id="planApptBox" hidden>/, 'anfangs ausgeblendet');
    const c = app();
    const box = c.document.getElementById('planApptBox');
    box.hidden = true;
    assert.ok(c.openPlanAppts());
    assert.equal(box.hidden, false);
    assert.match(c.document.getElementById('apptSettings').innerHTML, /Fußballtraining/);
    c.closePlanAppts();
    assert.equal(box.hidden, true);
  });

  test('4 Belastung nach Dauer und Härte (sRPE = Minuten × Härte, Foster)', () => {
    const c = app();
    const L = (a) => plain(c.activityEntryLoad(a));
    assert.equal(L({ activity: 'squash', minutes: 75, rpe: 8 }).legs, 3, 'Squash 75 Min, Härte 8 → Beine 3');
    assert.equal(L({ activity: 'squash', minutes: 30, rpe: 5 }).legs, 1, 'Squash 30 Min, Härte 5 → Beine 1');
    assert.deepEqual(L({ activity: 'squash', minutes: 60, rpe: 6 }), { legs: 2, push: 1, pull: 1, core: 2 }, '= Referenz → Grundprofil');
    assert.deepEqual(L({ activity: 'squash', minutes: 300, rpe: 10 }), { legs: 3, push: 3, pull: 3, core: 3 }, 'gedeckelt auf 3');
    assert.deepEqual(L({ activity: 'mobility', minutes: 60, rpe: 9 }), { legs: 0, push: 0, pull: 0, core: 0 });
    // ohne Härte: Grundprofil bzw. Spielminuten
    assert.deepEqual(L({ activity: 'squash', minutes: 75 }), { legs: 2, push: 1, pull: 1, core: 2 });
    assert.equal(L({ activity: 'match', minutes: 30 }).legs, 2, 'Spiel nur Minuten → matchLoadForMinutes');
    assert.equal(L({ activity: 'match' }).legs, 3);
    // Spiel: Referenz 540 (90 × 6)
    assert.equal(c.refSrpeOf('match'), 540);
    assert.equal(c.refSrpeOf('squash'), 360);
    assert.equal(L({ activity: 'match', minutes: 90, rpe: 6 }).legs, 3);
    assert.equal(L({ activity: 'match', minutes: 30, rpe: 4 }).legs, 1);
    // eigene Referenz je Aktivität (optional)
    c.flexSchedule().activities.squash.refSrpe = 600;
    assert.equal(L({ activity: 'squash', minutes: 75, rpe: 8 }).legs, 2);
    delete c.flexSchedule().activities.squash.refSrpe;
    // Tagesblatt zeigt die Rechnung
    c.openDaySheet('2026-11-19');
    c.daySheetSet('key', 'squash'); c.daySheetSet('min', '75'); c.daySheetSet('rpe', 8);
    assert.match(c.document.getElementById('appDialog').innerHTML, /Squash 75 Min · Härte 8 → Beine Stufe 3/);
    c.daySheetSave();
    const ev = c.flexEvents().filter((e) => e.key === 'squash');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].load.legs, 3, 'fließt in die Erholung ein');
  });

  // ── 5 Deload-Fehlalarm ──
  const DAYS = ['2026-11-02', '2026-11-09', '2026-11-16'];
  // lifts: {Name: [[w, r], [w, r], [w, r]]} je Session
  const hist = (lifts, days = DAYS) => days.map((d, i) => ({ ts: Date.parse(d + 'T17:00:00'), dayName: 'Ganzkörper', durationMs: 3e6, volume: 0,
    sets: Object.entries(lifts).map(([ex, s]) => ({ ex, w: s[i][0], r: s[i][1], rpe: 8 })) }));
  const PLAN5 = () => [{ id: 'gk', type: 'gym', name: 'Ganzkörper', ex: [
    { n: 'Bankdrücken (LH)', s: '4×5-8' }, { n: 'Kniebeuge (LH)', s: '4×5-8' }, { n: 'Rudern (LH Untergriff)', s: '3×8-10' },
    { n: 'Klimmzüge', s: '4×6-10' }, { n: 'Seitheben (Kabel)', s: '3×12-15' }, { n: 'Beinbeuger (sitzend)', s: '3×10-12' }] }];
  const FLAT = [[100, 5], [100, 5], [100, 5]], UP = [[100, 5], [102.5, 5], [105, 5]];
  const deloadApp = (lifts, days) => {
    const c = loadApp({ plan: PLAN5(), history: hist(lifts, days) }, { now: NOW });
    c.mesoWeek = () => 3; c.deloadActive = () => false;   // Woche 3: vorzeitiger Deload möglich
    return c;
  };

  test('5 Eine alte Übung, die nicht im Plan steht, zählt nie in stalledLifts()', () => {
    const c = deloadApp({ 'Beinstrecker': FLAT, 'Bankdrücken (LH)': UP });
    assert.deepEqual(plain(c.stalledLifts()), []);
    // im Plan, aber seit über 28 Tagen nicht trainiert → zählt ebenfalls nicht
    const old = deloadApp({ 'Bankdrücken (LH)': FLAT }, ['2026-09-07', '2026-09-14', '2026-09-21']);
    assert.deepEqual(plain(old.stalledLifts()), []);
  });

  test('5 Seitheben (Kabel) 20 kg mit 12 → 13 → 14 Wdh gilt nicht als Plateau; 12 → 12 → 12 schon', () => {
    const c = deloadApp({ 'Seitheben (Kabel)': [[20, 12], [20, 13], [20, 14]] });
    assert.equal(c.liftTrend('Seitheben (Kabel)').plateau, true, 'E1RM ist bei 12 Wdh gedeckelt');
    assert.deepEqual(plain(c.stalledLifts()), []);
    assert.deepEqual(plain(deloadApp({ 'Seitheben (Kabel)': [[20, 12], [20, 12], [20, 12]] }).stalledLifts()), ['Seitheben (Kabel)']);
    assert.deepEqual(plain(deloadApp({ 'Seitheben (Kabel)': [[20, 15], [22.5, 10], [22.5, 12]] }).stalledLifts()), [], 'mehr Gewicht = Fortschritt');
  });

  test('5 needsDeload(): mindestens 2 Übungen UND ein Drittel der Grundübungen; Text relativ', () => {
    // 1 von 4 Grundübungen + 1 Isolation stagnieren → kein Deload
    let c = deloadApp({ 'Bankdrücken (LH)': FLAT, 'Kniebeuge (LH)': UP, 'Rudern (LH Untergriff)': UP, 'Klimmzüge': UP, 'Beinbeuger (sitzend)': [[50, 10], [50, 10], [50, 10]] });
    assert.equal(c.stalledLifts().length, 2);
    assert.equal(c.needsDeload(), null);
    // 2 von 4 Grundübungen → Deload, Text "2 von 4 Grundübungen stagnieren"
    c = deloadApp({ 'Bankdrücken (LH)': FLAT, 'Kniebeuge (LH)': FLAT, 'Rudern (LH Untergriff)': UP, 'Klimmzüge': UP });
    const d = c.needsDeload();
    assert.ok(d);
    assert.match(d.reason, /^2 von 4 Grundübungen stagnieren \(Bankdrücken \(LH\), Kniebeuge \(LH\)\)/);
    c.renderSmartNotifs();
    assert.match(c.document.getElementById('smartNotifs').innerHTML, /2 von 4 Grundübungen stagnieren/);
    // nur 1 stagnierende Übung → nie
    c = deloadApp({ 'Bankdrücken (LH)': FLAT, 'Kniebeuge (LH)': UP });
    assert.equal(c.needsDeload(), null);
  });

  test('5 isCompoundLift(): Ausschlussliste vor dem Grundübungs-Muster, geprüft für alle Übungsnamen der App', () => {
    const c = app();
    const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/\bn\s*:\s*'([^']+)'/g)) names.add(m[1]);            // Pläne, EXERCISE_FAMILIES
    for (const m of src.matchAll(/\bE\('([^']+)'/g)) names.add(m[1]);                 // Plan-Generator
    for (const m of src.matchAll(/pick\(\/[^/]*\/i?,\s*'([^']+)'/g)) names.add(m[1]);
    Object.entries(c.EX_ALIAS).forEach(([a, b]) => { names.add(a); names.add(b); }); // Aliase
    assert.ok(names.size > 60, 'Namen gefunden: ' + names.size);
    const EXCL = /fly|flys|waden|calf|trizeps|tricep|curl|extension|seitheb|lateral/i;
    const OLD = /bank|drück|press|kniebeug|squat|kreuzheb|deadlift|rudern|row|klimm|latzug|pulldown|^dip|beinpresse|hip thrust|ausfallschritt|lunge/i;
    for (const n of names) assert.equal(c.isCompoundLift(n), !EXCL.test(n) && OLD.test(n), n);
    for (const n of ['KH-Flys (Schrägbank)', 'Wadenheben (Beinpresse)', 'Trizepsdrücken']) assert.equal(c.isCompoundLift(n), false, n);
    for (const n of ['Bankdrücken (LH)', 'Schrägbankdrücken (KH)', 'Beinpresse', 'Schulterdrücken (KH sitzend)', 'Dips (Brust)']) assert.equal(c.isCompoundLift(n), true, n);
    // nur diese beiden Übungen der App wechseln die Klasse
    assert.deepEqual([...names].filter((n) => OLD.test(n) && !c.isCompoundLift(n)).sort(), ['KH-Flys (Schrägbank)', 'Wadenheben (Beinpresse)']);
    // Pausen laufen jetzt über die Isolations-Regel (Recomp-Modus: 90 s statt 150 s)
    assert.equal(c.restSecondsFor('KH-Flys (Schrägbank)', false), 90);
    assert.equal(c.restSecondsFor('Wadenheben (Beinpresse)', false), 90);
    assert.equal(c.restSecondsFor('Bankdrücken (LH)', false), 150);
    assert.equal(c.isIsolationLift('KH-Flys (Schrägbank)'), true);
  });
}
