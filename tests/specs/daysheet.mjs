// feat/day-sheet – Tagesblatt, Termin-Absage auf Heute, Termine im Plan-Tab,
// Belastung nach Session-RPE (Foster), Deload-Fehlalarm
export const title = 'Tagesblatt · Termine, Aktivitäten, sRPE-Belastung, Stagnation';

const plain = (x) => JSON.parse(JSON.stringify(x));

// Mi = 2, Fr = 4, So = 6 (0 = Montag)
const SCHED = () => ({ appointments: [
  { id: 'tr', name: 'Fußballtraining', activity: 'soccer', weekdays: [2, 4], time: '19:00' },
  { id: 'sp', name: 'Spiel', activity: 'match', weekdays: [6], time: '15:00' },
] });

export default function ({ test, assert, loadApp }) {
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
}
