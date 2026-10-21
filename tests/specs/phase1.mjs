// Phase 1: Datenqualität – Akzeptanzkriterien
export const title = 'Phase 1 · Datenqualität';

const DAY = 864e5;
function session(date, ex, rows, extra = {}) {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName: 'Test', durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })), ...extra };
}
function workout(ctx, exercises, extra = {}) {
  ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
    exercises: exercises.map((e) => ({ isTimed: false, coach: {}, done: false, ...e })), ...extra };
}
const html = (ctx) => ctx.document.getElementById('workoutContent').innerHTML;
const SC = 'Skull Crushers (LH)';

import { findOutliers } from '../backup-summary.mjs';

export default function ({ test, todo, assert, loadApp, loadFixture, fixtureNames }) {
  test('1.1 Gewicht > 1,5× des letzten Arbeitsgewichts → Inline-Rückfrage statt Abhaken', () => {
    const ctx = loadApp({ history: [session('2026-10-12', SC, [[25, 10, 8], [25, 10, 8], [25, 9, 8]])] }, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: SC, s: '3×8-10', sets: [{ w: '125', r: '10', rpe: '', done: false }, { w: '25', r: '10', rpe: '', done: false }] }]);
    assert.equal(ctx.toggleSetDone(0), 'ask');
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[0].done, false);
    ctx.renderWorkout();
    assert.match(html(ctx), /125 kg statt 25 kg\?/);
    assert.match(html(ctx), /Bestätigen/);
    assert.match(html(ctx), /Korrigieren/);
    // Korrigieren: Rückfrage weg, Satz bleibt offen
    ctx.fixPlausible();
    ctx.renderWorkout();
    assert.doesNotMatch(html(ctx), /statt 25 kg/);
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[0].done, false);
    // Bestätigen: Satz wird abgehakt, kein zweites Nachfragen
    ctx.toggleSetDone(0);
    ctx.confirmPlausible();
    assert.equal(ctx.AppState.activeSession.exercises[0].sets[0].done, true);
    // normales Gewicht → direkt abgehakt
    assert.equal(ctx.toggleSetDone(1), 'done');
  });

  test('1.1 Gewicht < 0,5× fragt nach; ohne Historie und bei Körpergewicht keine Rückfrage', () => {
    const ctx = loadApp({ history: [session('2026-10-12', 'Bankdrücken (LH)', [[110, 8, 8], [110, 8, 8], [110, 7, 8]])] }, { now: '2026-10-19T17:00:00Z' });
    assert.match(ctx.plausibilityIssue('Bankdrücken (LH)', { w: '11', r: '8' }, false, false).msg, /11 kg statt 110 kg\?/);
    assert.equal(ctx.plausibilityIssue('Bankdrücken (LH)', { w: '112.5', r: '8' }, false, false), null);
    assert.equal(ctx.plausibilityIssue('Beinpresse', { w: '400', r: '8' }, false, false), null, 'ohne Historie kein Vergleich');
    assert.equal(ctx.plausibilityIssue('Klimmzüge', { add: '40', r: '8' }, false, true), null);
  });

  test('1.1 Wdh nur 1–50: Abhaken blockiert (nur "Korrigieren"), > 50 wird nicht gespeichert', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [{ w: '45', r: '120', rpe: '8', done: false }, { w: '45', r: '12', rpe: '8', done: false }] }]);
    assert.equal(ctx.toggleSetDone(0), 'ask');
    ctx.renderWorkout();
    assert.match(html(ctx), /Erlaubt sind 1–50 Wdh/);
    assert.doesNotMatch(html(ctx), /id="plausOk"/, 'bei Wdh gibt es kein Bestätigen');
    assert.match(html(ctx), /data-set-field="r"[^>]*min="1" max="50"/);
    ctx.finishWorkout();
    const saved = ctx.AppState.history[0].sets;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].r, 12);
  });

  test('1.1 RPE nur 5–10 in 0,5-Schritten: Buttons 6–10, beim Speichern wird alles andere verworfen', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [
      { w: '45', r: '12', rpe: '78', done: true }, { w: '45', r: '12', rpe: '8.3', done: true },
      { w: '45', r: '12', rpe: '4', done: true }, { w: '45', r: '12', rpe: '9.5', done: true }] }]);
    ctx.renderWorkout();
    assert.doesNotMatch(html(ctx), /data-set-field="rpe"/, 'kein Zahlenfeld für RPE (Phase 4 bleibt)');
    const vals = [...html(ctx).matchAll(/data-rpe-val="([\d.]+)"/g)].map((m) => +m[1]);
    assert.deepEqual(vals, [6, 7, 8, 9, 10]);
    ctx.finishWorkout();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.AppState.history[0].sets.map((x) => x.rpe))), [null, 8.5, null, 9.5]);
  });
  test('1.2 Abhaken setzt lastSetTs, finishWorkout misst die Dauer bis zum letzten Satz', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [{ w: '45', r: '12', rpe: '8', done: false }] }],
      { startTs: Date.parse('2026-10-19T16:00:00Z') });
    ctx.toggleSetDone(0);
    assert.equal(ctx.AppState.activeSession.lastSetTs, Date.parse('2026-10-19T17:00:00Z'));
    ctx.__harness.setNow('2026-10-19T21:00:00Z');             // erst 4 h später beendet
    ctx.finishWorkout();
    const h = ctx.AppState.history[0];
    assert.equal(h.durationMs, 3600e3, 'Dauer bis zum letzten Satz, nicht bis zum Beenden');
    assert.equal(h.ts, Date.parse('2026-10-19T17:00:00Z'));
  });

  test('1.2 Offene Session > 3 h: Karte mit "Beenden" (nutzt lastSetTs) und "Verwerfen"', () => {
    const start = Date.parse('2026-10-18T16:00:00Z');
    const mk = () => {
      const ctx = loadApp({}, { now: '2026-10-19T08:00:00Z' });
      workout(ctx, [{ n: 'Beinstrecker', s: '3×12-15', sets: [{ w: '45', r: '12', rpe: '8', done: true }] }],
        { startTs: start, lastSetTs: start + 50 * 60e3, dayName: 'Legs A' });
      return ctx;
    };
    const ctx = mk();
    ctx.renderSmartNotifs();
    const card = ctx.document.getElementById('smartNotifs').innerHTML;
    assert.match(card, /Offene Session von .*18\.10\..* beenden\?/);
    assert.match(card, /finishStaleSession\(\)[^>]*>Beenden/);
    assert.match(card, /discardStaleSession\(\)[^>]*>Verwerfen/);
    ctx.finishStaleSession();
    assert.equal(ctx.AppState.history[0].durationMs, 50 * 60e3);
    assert.equal(ctx.AppState.activeSession, null);

    const weg = mk();
    weg.discardStaleSession();
    assert.equal(weg.AppState.history.length, 0);
    assert.equal(weg.AppState.activeSession, null);

    // frische Session (< 3 h) → keine Karte
    const frisch = loadApp({}, { now: '2026-10-19T08:00:00Z' });
    workout(frisch, [{ n: 'Beinstrecker', s: '3×12-15', sets: [] }]);
    frisch.renderSmartNotifs();
    assert.doesNotMatch(frisch.document.getElementById('smartNotifs').innerHTML, /Offene Session/);
  });

  test('1.2 Sessions > 4 h zählen nicht in Zeit-Kennzahlen (Log zeigt "–")', () => {
    const ctx = loadApp(loadFixture('outliers'));
    assert.equal(ctx.sessionTimeValid({ durationMs: 48 * 3600e3 }), false);
    assert.equal(ctx.sessionTimeValid({ durationMs: 70 * 60e3 }), true);
    ctx.renderLog();
    const log = ctx.document.getElementById('logList').innerHTML;
    assert.match(log, />–<\/div><div style="font-size:9px;color:var\(--t3\)">DAUER/);
    assert.doesNotMatch(log, /2880:00/);
  });
  test('1.3 Satz bearbeiten (w, r, rpe) berechnet PRs und Volumen neu und speichert', () => {
    const ctx = loadApp(loadFixture('outliers'));
    const hIdx = ctx.AppState.history.findIndex((s) => s.sets.some((x) => x.ex === SC && x.w === 125));
    const sIdx = ctx.AppState.history[hIdx].sets.findIndex((x) => x.ex === SC && x.w === 125);
    assert.ok(ctx.AppState.prs[SC] >= 60);
    assert.equal(ctx.logUpdateSet(hIdx, sIdx, { w: '25', r: '12', rpe: '8.5' }), true);
    const st = ctx.AppState.history[hIdx].sets[sIdx];
    assert.deepEqual([st.w, st.r, st.rpe], [25, 12, 8.5]);
    assert.ok(ctx.AppState.prs[SC] < 60, `PR ${ctx.AppState.prs[SC]}`);
    const vol = ctx.AppState.history[hIdx].sets.reduce((a, x) => a + (x.w || 0) * (x.r || 0), 0);
    assert.equal(ctx.AppState.history[hIdx].volume, vol);
    assert.equal(JSON.parse(ctx.localStorage.getItem('kinetic.history'))[hIdx].sets[sIdx].w, 25, 'nicht gespeichert');
    // ungültige Werte ändern nichts
    assert.equal(ctx.logUpdateSet(hIdx, sIdx, { w: '25', r: '70', rpe: '8' }), false);
    assert.equal(ctx.logUpdateSet(hIdx, sIdx, { w: '0', r: '10', rpe: '8' }), false);
    assert.equal(ctx.logUpdateSet(hIdx, sIdx, { w: '25', r: '10', rpe: '78' }), true);
    assert.equal(ctx.AppState.history[hIdx].sets[sIdx].rpe, null, 'RPE außerhalb 5–10 wird nicht gespeichert');
  });

  test('1.3 Körpergewichtssatz: Bearbeiten ändert die Zusatzlast, w bleibt Körpergewicht + Zusatz', () => {
    const ctx = loadApp({ history: [{ ts: Date.parse('2026-10-12T17:00:00Z'), dayName: 'Pull A', durationMs: 3e6, volume: 0,
      sets: [{ ex: 'Klimmzüge', w: 105, add: 0, r: 10, rpe: 8 }] }] });
    assert.equal(ctx.logUpdateSet(0, 0, { add: '5', r: '8', rpe: '9' }), true);
    const st = ctx.AppState.history[0].sets[0];
    assert.deepEqual([st.w, st.add, st.r], [110, 5, 8]);
  });

  test('1.3 Satz und Session löschen; Session-Löschen braucht zwei Tipps', () => {
    const ctx = loadApp(loadFixture('outliers'));
    const n = ctx.AppState.history.length;
    const before = ctx.AppState.history[0].sets.length;
    ctx.logRemoveSet(0, 0);
    assert.equal(ctx.AppState.history[0].sets.length, before - 1);
    ctx.logStartEdit(0);
    ctx.logRemoveSession(0);
    assert.equal(ctx.AppState.history.length, n, 'erster Tipp löscht noch nicht');
    assert.match(ctx.document.getElementById('logList').innerHTML, /Wirklich löschen\? Nochmal tippen/);
    ctx.logRemoveSession(0);
    assert.equal(ctx.AppState.history.length, n - 1);
    assert.equal(JSON.parse(ctx.localStorage.getItem('kinetic.history')).length, n - 1);
  });

  test('1.3 Log: Bearbeiten-Button, Edit-Ansicht mit RPE-Auswahl 5–10 und "Mehr laden" ab 21 Sessions', () => {
    const hist = Array.from({ length: 25 }, (_, i) => session(`2026-09-${String(i + 1).padStart(2, '0')}`, 'Beinstrecker', [[45, 12, 8]]));
    const ctx = loadApp({ history: hist }, { now: '2026-10-19T17:00:00Z' });
    ctx.renderLog();
    let log = ctx.document.getElementById('logList').innerHTML;
    assert.equal((log.match(/logStartEdit\(/g) || []).length, 20);
    assert.match(log, /Mehr laden \(5 ältere Sessions\)/);
    ctx.logLoadMore();
    log = ctx.document.getElementById('logList').innerHTML;
    assert.equal((log.match(/logStartEdit\(/g) || []).length, 25);
    assert.doesNotMatch(log, /Mehr laden/);
    ctx.logStartEdit(24);
    log = ctx.document.getElementById('logList').innerHTML;
    assert.match(log, /id="lg-w-24-0"[^>]*value="45"/);
    assert.match(log, /<select id="lg-rpe-24-0"[^>]*>.*<option value="5">5<\/option>.*<option value="8" selected>8<\/option>.*<option value="10">10<\/option><\/select>/s);
    assert.doesNotMatch(log, /value="10.5"|value="4.5"/);
  });
  test('1.4 Bereinigungs-Assistent: outliers.json liefert genau 3 Funde', () => {
    const ctx = loadApp(loadFixture('outliers'));
    const f = JSON.parse(JSON.stringify(ctx.findDataIssues(false)));
    assert.equal(f.length, 3, f.map((x) => x.msg).join(' | '));
    assert.deepEqual(f.map((x) => x.kind).sort(), ['dauer', 'gewicht', 'rpe']);
    assert.match(f.find((x) => x.kind === 'gewicht').msg, /^125 kg × 12/);
    // gleiche Kriterien wie die Backup-Zusammenfassung (tests/backup-summary.mjs)
    for (const name of fixtureNames()) {
      const c = loadApp(loadFixture(name));
      assert.equal(c.findDataIssues(true).length, findOutliers(loadFixture(name).state.history).length, name);
    }
  });

  test('1.4 Nach Löschen des 125-kg-Satzes liegt der PR für Skull Crushers (LH) unter 60', () => {
    const ctx = loadApp(loadFixture('outliers'));
    assert.ok(ctx.AppState.prs[SC] >= 60, 'Ausgangslage: Tippfehler treibt den PR hoch');
    const f = ctx.findDataIssues(false).find((x) => x.kind === 'gewicht');
    assert.equal(ctx.resolveDataIssue(f, 'delete'), true);
    assert.ok(ctx.AppState.prs[SC] < 60, `PR ${ctx.AppState.prs[SC]}`);
    assert.equal(ctx.findDataIssues(false).length, 2);
  });

  test('1.4 Korrigieren, "Ist korrekt" (bleibt gemerkt) und Löschen für RPE und Dauer', () => {
    const ctx = loadApp(loadFixture('outliers'));
    const find = (k) => ctx.findDataIssues(false).find((x) => x.kind === k);
    assert.equal(ctx.resolveDataIssue(find('gewicht'), 'fix', '25'), true);
    assert.ok(ctx.AppState.prs[SC] < 60);
    assert.equal(ctx.resolveDataIssue(find('rpe'), 'fix', '11'), false, 'RPE-Korrektur nur 5–10');
    assert.equal(ctx.resolveDataIssue(find('rpe'), 'fix', '7.5'), true);
    const dauer = find('dauer');
    assert.equal(ctx.resolveDataIssue(dauer, 'ok'), true);
    assert.equal(ctx.findDataIssues(false).length, 0);
    assert.equal(ctx.findDataIssues(true).length, 1, '"Ist korrekt" blendet nur aus, ändert nichts');
    // gemerkt über einen Neustart hinweg
    const neu = loadApp({ history: JSON.parse(JSON.stringify(ctx.AppState.history)) }, { db: { dataIssuesOk: JSON.parse(ctx.localStorage.getItem('kinetic.dataIssuesOk')) } });
    assert.equal(neu.findDataIssues(false).length, 0);
    assert.equal(ctx.resolveDataIssue(dauer, 'delete'), true);
    assert.equal(ctx.AppState.history[dauer.hIdx].durationMs, 0);
  });

  test('1.4 UI: Profil > Daten > "Daten prüfen" listet Funde mit Korrigieren / Löschen / Ist korrekt', () => {
    const ctx = loadApp(loadFixture('outliers'));
    ctx.openDataCheck();
    const box = ctx.document.getElementById('dataCheckBox').innerHTML;
    assert.match(box, /3 auffällige Einträge/);
    assert.equal((box.match(/>Korrigieren</g) || []).length, 3);
    assert.equal((box.match(/>Ist korrekt</g) || []).length, 3);
    assert.match(box, />Satz löschen</);
    assert.match(box, />RPE löschen</);
    assert.match(box, />Dauer löschen</);
    ctx.dcFix(1);
    assert.match(ctx.document.getElementById('dataCheckBox').innerHTML, /id="dcFixInp"/);
  });
}
