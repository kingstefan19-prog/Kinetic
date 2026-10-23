// fix/integration – Fehler, die erst im Zusammenspiel mit echter Historie auffallen
export const title = 'Integration · Schlaf, Pausen, Varianten, Startgewicht, Spieltag';

const DAY = 864e5;
const plain = (x) => JSON.parse(JSON.stringify(x));
function session(date, ex, rows, dayName = 'Test') {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}

export default function ({ test, assert, loadApp }) {
  // ── 1 Altersgrenze für Schlaf, HRV und Ruhepuls ──
  test('1 Ein alter sleepLog-Eintrag (5 Monate, 6 h) erzeugt kein "Wenig Schlaf"', () => {
    const ctx = loadApp({ sleepLog: [{ h: 6, d: '2026-05-20' }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(ctx.recentSleepQuality(), null);
    assert.equal(ctx.recoveryStatus(), null);
    ctx.renderSmartNotifs();
    assert.doesNotMatch(ctx.document.getElementById('smartNotifs').innerHTML, /Wenig Schlaf|Schlafmangel/);
    // Einträge der letzten 3 Kalendertage zählen weiter
    const neu = loadApp({ sleepLog: [{ h: 6, d: '2026-05-20' }, { h: 6, d: '2026-10-19' }, { h: 6, d: '2026-10-20' }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(neu.recentSleepQuality().q, 'low');
    // vorgestern zählt, vor 3 Tagen nicht mehr
    assert.equal(loadApp({ sleepLog: [{ h: 6, d: '2026-10-19' }] }, { now: '2026-10-21T08:00:00Z' }).recentSleepQuality().q, 'low');
    assert.equal(loadApp({ sleepLog: [{ h: 6, d: '2026-10-18' }] }, { now: '2026-10-21T08:00:00Z' }).recentSleepQuality(), null);
  });

  test('1 HRV und Ruhepuls aus wearableLog nur aus den letzten 3 Kalendertagen', () => {
    const base = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map((d) => ({ d, hrv: 60, rhr: 50 }));
    // letzter Wert vor 6 Wochen → kein Signal
    const alt = loadApp({ wearableLog: [...base, { d: '2026-09-06', hrv: 40, rhr: 60 }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(alt.hrvStatus(), null);
    assert.equal(alt.rhrStatus(), null);
    assert.equal(alt.recoveryStatus(), null);
    // gestern gemessen → wird gewertet (supprimierte HRV, erhöhter Ruhepuls)
    const neu = loadApp({ wearableLog: [...base, { d: '2026-10-20', hrv: 40, rhr: 60 }] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(neu.hrvStatus().status, 'suppressed');
    assert.equal(neu.rhrStatus().status, 'elevated');
    assert.equal(neu.recoveryStatus().q, 'bad');
  });
}
