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

  // ── 2 Pausen-Schwelle ──
  const BS = 'Bankdrücken (LH)';
  const bank = (date) => session(date, BS, [[110, 8, 8], [110, 8, 8], [110, 8, 8]]);

  test('2 layoffStatus: bis 21 Tage keine Pause, 22–28 gleiches Gewicht, 29–56 −10 %, darüber −20 %', () => {
    const at = (days) => {
      const ctx = loadApp({ history: [bank('2026-09-01')] }, { now: new Date(Date.parse('2026-09-01T17:00:00Z') + days * DAY).toISOString() });
      return { st: ctx.layoffStatus(BS), sug: ctx.coachSuggestion(BS, '4×5-8'), ctx };
    };
    for (const d of [10, 14, 21]) assert.equal(at(d).st, null, `${d} Tage`);
    assert.equal(at(14).sug.weight, 112.5, '14 Tage (ein verpasster Montag): normale Progression');
    assert.doesNotMatch(at(14).sug.hint, /Pause/);
    const d25 = at(25);
    assert.equal(d25.st.mod, 1);
    assert.equal(d25.sug.weight, 110, 'gleiches Gewicht, keine Steigerung');
    assert.doesNotMatch(d25.st.note, /RIR/, 'Pausen-Text nennt keine eigene RIR');
    assert.equal(at(40).st.mod, 0.9);
    assert.equal(at(40).sug.weight, 100);
    assert.equal(at(70).st.mod, 0.8);
  });

  test('2 Während einer Pause liefert targetRIR(exName) Ziel-RIR + 1', () => {
    const pause = loadApp({ history: [bank('2026-09-01')] }, { now: '2026-09-26T08:00:00Z' });   // 25 Tage
    assert.ok(pause.layoffStatus(BS));
    assert.equal(pause.targetRIR(BS), 3, 'Woche 1: RIR 2 + 1');
    const normal = loadApp({ history: [bank('2026-09-01')] }, { now: '2026-09-15T08:00:00Z' });   // 14 Tage
    assert.equal(normal.targetRIR(BS), 2);
  });

  test('2 Mesozyklus-Neustart nach > 14 Tagen bezieht sich weiter auf das gesamte Training', () => {
    const MO = (d) => Date.parse(`${d}T00:00:00`);
    // Gesamttraining lückenlos, nur Bankdrücken 14 Tage weg → kein Neustart
    const hist = [bank('2026-09-01'), session('2026-09-08', 'Beinstrecker', [[45, 12, 8]]), bank('2026-09-15')];
    const ctx = loadApp({ meso: { start: MO('2026-08-31') }, history: hist }, { now: '2026-09-16T08:00:00Z' });
    assert.equal(ctx.mesoWeek(), 3);
  });

  // ── 3 Varianten ──
  test('3 Seitheben (Kabel) letzte Woche: Seitheben (KH) nach 18 Wochen startet normal, nicht mit −20 %', () => {
    const hist = [session('2026-06-22', 'Seitheben (KH)', [[14, 12, 8], [14, 12, 8], [14, 11, 8]]),
      session('2026-10-14', 'Seitheben (Kabel)', [[20, 14, 8], [20, 13, 8]])];
    const ctx = loadApp({ history: hist }, { now: '2026-10-21T08:00:00Z' });
    assert.ok(ctx.isRelatedExercise('Seitheben (KH)', 'Seitheben (Kabel)'));
    assert.equal(ctx.layoffStatus('Seitheben (KH)'), null);
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.ok(r.weight >= 14, `Gewicht ${r.weight}`);
    assert.doesNotMatch(r.hint, /Pause|−20/);
    // ohne verwandte Übung: weiterhin −20 %
    const allein = loadApp({ history: [hist[0], session('2026-10-14', 'Beinpresse', [[200, 10, 8]])] }, { now: '2026-10-21T08:00:00Z' });
    assert.equal(allein.layoffStatus('Seitheben (KH)').mod, 0.8);
  });

  test('3 Gleicher Primärmuskel zählt ebenfalls; preLayoffRef ignoriert überbrückte Lücken', () => {
    assert.equal(loadApp({}).isRelatedExercise('Kabelflys (untere Rolle)', 'Bankdrücken (LH)'), true, 'beide Brust (w = 1)');
    assert.equal(loadApp({}).isRelatedExercise('Beinstrecker', 'Bankdrücken (LH)'), false);
    const SB = 'Schrägbankdrücken (KH)';
    const hist = [session('2026-09-01', SB, [[42, 9, 8], [42, 9, 8]]), session('2026-09-08', SB, [[42, 9, 8], [42, 9, 8]]),
      session('2026-09-20', 'Bankdrücken (LH)', [[100, 8, 8]]), session('2026-10-01', 'Bankdrücken (LH)', [[100, 8, 8]]),
      session('2026-10-07', SB, [[34, 10, 7], [34, 10, 7]])];
    const ctx = loadApp({ history: hist }, { now: '2026-10-10T08:00:00Z' });
    assert.equal(ctx.preLayoffRef(SB), null, 'Brust lief durchgehend weiter');
    assert.doesNotMatch(ctx.coachSuggestion(SB, '3×8-12').hint, /Vor der Pause/);
  });
}
