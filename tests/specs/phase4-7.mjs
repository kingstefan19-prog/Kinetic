// Phasen 4–7 – Akzeptanzkriterien
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Phasen 4–7 · RPE, Plan 3+1, Datenerfassung, Release';

const DAY = 864e5;
function session(date, sets, dayName = 'Test') {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs: 3e6, volume: 0, sets };
}
function workout(ctx, exercises) {
  ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
    exercises: exercises.map((e) => ({ isTimed: false, coach: {}, done: false, ...e })) };
}

export default function ({ test, todo, assert, loadApp, REPO_ROOT }) {
  // ── Phase 4 ──
  test('4.1 Schnellwahl RIR 0/1/2/3/4+ (statt RPE 6–10) statt Zahlenfeld', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Seitheben (Kabel)', s: '3×12-15',
      sets: [{ w: '20', r: '14', rpe: '8', done: true }, { w: '20', r: '13', rpe: '', done: false }] }]);
    ctx.renderWorkout();
    const html = ctx.document.getElementById('workoutContent').innerHTML;
    for (const v of [0, 1, 2, 3, 4]) assert.match(html, new RegExp(`data-rir-val="${v}"`));
    assert.match(html, /data-rir-val="4"[^>]*>4\+/, 'letzter Button heißt 4+');
    assert.doesNotMatch(html, /data-rpe-val/, 'keine RPE-Buttons mehr');
    assert.doesNotMatch(html, /data-set-field="rpe"/, 'altes Zahlenfeld noch da');
    assert.match(html, /RIR für Satz 2/, 'Schnellwahl soll auf den ersten offenen Satz zeigen');
    assert.match(html, /lange drücken = ,5/);
    assert.match(html, /RIR 2 = noch 2 Wdh möglich · RPE 8/);
    assert.match(html, /data-rir-pick="0"[^>]*>2<\/button>/, 'Satz 1 (RPE 8) zeigt RIR 2');
    assert.match(html, /<th[^>]*>RIR<\/th>/);
  });

  test('4.1 RIR-Texte und Grenzen (5–10 in 0,5-Schritten)', () => {
    const ctx = loadApp({});
    assert.equal(ctx.rirText(8), 'RIR 2 = noch 2 Wdh möglich · RPE 8');
    assert.equal(ctx.rirText(10), 'RIR 0 = keine Wdh mehr möglich · RPE 10');
    assert.equal(ctx.rirText(8.5), 'RIR 1,5 = noch 1–2 Wdh möglich · RPE 8,5');
    assert.equal(ctx.rirOf('6'), 4);
    assert.equal(ctx.rirOf(78), null);
    const cur = { sets: [{ rpe: '' }] };
    assert.equal(ctx.setRpeForSet(cur, 0, 8.5), true);
    assert.equal(cur.sets[0].rpe, '8.5');
    assert.equal(ctx.setRpeForSet(cur, 0, 10.5), false);
    assert.equal(ctx.setRpeForSet(cur, 0, 4), false);
    assert.equal(cur.sets[0].rpe, '8.5', 'ungültige Werte dürfen nichts überschreiben');
  });

  test('4.1 Halbe RPE wird beim Beenden als Zahl gespeichert', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Seitheben (Kabel)', s: '3×12-15', sets: [{ w: '20', r: '14', rpe: '8.5', done: true }] }]);
    ctx.finishWorkout();
    assert.equal(ctx.AppState.history[0].sets[0].rpe, 8.5);
  });
  // 40 Sätze in 4 Sessions, davon `gleich` mit RPE 8, der Rest RPE 7
  function rpeHistory(gleich) {
    const rpes = Array.from({ length: 40 }, (_, i) => (i < gleich ? 8 : 7));
    return [0, 1, 2, 3].map((k) => session(`2026-10-${String(5 + k * 3).padStart(2, '0')}`,
      rpes.slice(k * 10, k * 10 + 10).map((rpe) => ({ ex: 'Seitheben (Kabel)', w: 20, r: 14, rpe }))));
  }

  test('4.2 Varianz-Check: > 70 % gleiche RPE in den letzten 40 Sätzen → AMRAP-Karte', () => {
    // 19.10.2026 ist ein Montag → Push A, letzte Isolationsübung: Overhead Extension (KH)
    const ctx = loadApp({ history: rpeHistory(30) }, { now: '2026-10-19T08:00:00Z' });
    const v = ctx.rpeVariance();
    assert.equal(v.value, 8);
    assert.equal(v.share, 0.75);
    ctx.renderSmartNotifs();
    const html = ctx.document.getElementById('smartNotifs').innerHTML;
    assert.match(html, /RIR-Check: 75 % deiner letzten 40 Sätze mit RIR 2/);
    assert.match(html, /Deine RIR-Angaben wirken gewohnheitsmäßig\. Heute im letzten Satz von Overhead Extension \(KH\) so viele Wdh wie möglich \(AMRAP\)/);
  });

  test('4.2 Genau 70 % oder weniger als 40 bewertete Sätze → keine Karte', () => {
    const ctx = loadApp({ history: rpeHistory(28) }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(ctx.rpeHabitual(), false);
    ctx.renderSmartNotifs();
    assert.doesNotMatch(ctx.document.getElementById('smartNotifs').innerHTML, /AMRAP/);
    const wenig = loadApp({ history: rpeHistory(40).slice(0, 3) }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(wenig.rpeVariance(), null);
  });

  test('4.2 Kein Gym-Tag heute → Karte nennt das nächste Training', () => {
    const ctx = loadApp({ history: rpeHistory(40) }, { now: '2026-10-20T08:00:00Z' });   // Dienstag
    ctx.renderSmartNotifs();
    assert.match(ctx.document.getElementById('smartNotifs').innerHTML, /Im nächsten Training \(Pull A\) im letzten Satz von Face Pulls \(Kabel\)/);
  });

  test('4.2 Wochentag kommt aus der Position im Plan (verschobene Tage)', () => {
    const ctx = loadApp({ history: rpeHistory(40) }, { now: '2026-10-19T08:00:00Z' });   // Montag
    const p = ctx.AppState.plan;
    [p[0], p[2]] = [p[2], p[0]];               // Pull A auf Montag, Push A auf Mittwoch
    assert.equal(ctx.upcomingGymDay().day.name, 'Pull A');
    assert.equal(ctx.amrapSuggestion().ex, 'Face Pulls (Kabel)');
  });

  test('4.2 Workout markiert den letzten Satz der letzten Isolationsübung als AMRAP', () => {
    const ctx = loadApp({ history: rpeHistory(40) }, { now: '2026-10-19T08:00:00Z' });
    const day = ctx.AppState.plan.find((d) => d.id === 'mon');
    ctx.proceedWithWorkout('mon', day, false);
    const s = ctx.AppState.activeSession;
    assert.equal(s.amrapEx, 'Overhead Extension (KH)');
    s.currentIdx = s.exercises.findIndex((e) => e.n === 'Overhead Extension (KH)');
    ctx.renderWorkout();
    const html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /AMRAP im letzten Satz/);
    s.currentIdx = 0;
    ctx.renderWorkout();
    assert.doesNotMatch(ctx.document.getElementById('workoutContent').innerHTML, /AMRAP im letzten Satz/);
  });
  test('4.3 Kalibrierung: erwartete Wdh aus der vorherigen RPE, Offset = tatsächlich − erwartet', () => {
    const ctx = loadApp({});
    // 12 Wdh @ RPE 8,5 → erwartet 13,5 bei gleicher Last; AMRAP 15 → +1,5 (Reserve unterschätzt)
    const c = JSON.parse(JSON.stringify(ctx.rpeCalibration({ w: 20, r: 12, rpe: 8.5 }, { w: 20, r: 15 })));
    assert.deepEqual(c, { expected: 13.5, actual: 15, offset: 1.5, refRpe: 8.5 });
    assert.match(ctx.rpeOffsetText(c), /^\+1,5 Wdh · du unterschätzt deine Reserve \(gefühlte RIR 1,5 ≈ tatsächlich RIR 3\)/);
    // andere Last → Epley-Umrechnung: 20×12 @ 10 ≙ 18×≈16,7 → 16,5
    assert.equal(ctx.rpeCalibration({ w: 20, r: 12, rpe: 10 }, { w: 18, r: 14 }).expected, 16.5);
    assert.equal(ctx.rpeCalibration({ w: 20, r: 12 }, { w: 20, r: 15 }), null, 'ohne RPE keine Kalibrierung');
  });

  test('4.3 AMRAP im Workout speichert AppState.rpeOffset (auch im Backup) und zeigt ihn an', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Overhead Extension (KH)', s: '3×10-12', done: true, sets: [
      { w: '18', r: '12', rpe: '8', done: true }, { w: '18', r: '12', rpe: '8.5', done: true }, { w: '18', r: '15', rpe: '', done: true }] }]);
    ctx.AppState.activeSession.amrapEx = 'Overhead Extension (KH)';
    ctx.finishWorkout();
    assert.equal(ctx.AppState.rpeOffset, 1.5);
    assert.equal(ctx.AppState.rpeCalib.ex, 'Overhead Extension (KH)');
    const last = ctx.AppState.history[0].sets;
    assert.equal(last[last.length - 1].rpe, 10, 'AMRAP-Satz ohne Angabe = RPE 10');
    assert.equal(JSON.parse(ctx.localStorage.getItem('kinetic.rpeOffset')), 1.5);
    assert.equal(ctx.buildBackupObject().state.rpeOffset, 1.5);
    const neu = loadApp({});
    neu.applyBackupState(JSON.parse(JSON.stringify(ctx.buildBackupObject().state)));
    assert.equal(neu.AppState.rpeOffset, 1.5);
    // Anzeige in der RPE-Schnellwahl
    workout(ctx, [{ n: 'Seitheben (Kabel)', s: '3×12-15', sets: [{ w: '20', r: '', rpe: '', done: false }] }]);
    ctx.renderWorkout();
    assert.match(ctx.document.getElementById('workoutContent').innerHTML, /Kalibrierung \(19\.10\.\): \+1,5 Wdh/);
  });

  test('4.3 Offset wird nicht in e1rm eingerechnet; frische Kalibrierung pausiert die AMRAP-Karte', () => {
    const ctx = loadApp({ history: rpeHistory(40) }, { now: '2026-10-19T08:00:00Z' });
    const vorher = ctx.e1rm(100, 8, 8);
    const prVorher = JSON.stringify(ctx.recomputePRs(ctx.AppState.history));
    ctx.AppState.rpeOffset = 2;
    ctx.AppState.rpeCalib = { ts: ctx.Date.now() - 3 * DAY, ex: 'Seitheben (Kabel)', offset: 2, refRpe: 8 };
    assert.equal(ctx.e1rm(100, 8, 8), vorher);
    assert.equal(JSON.stringify(ctx.recomputePRs(ctx.AppState.history)), prVorher);
    assert.equal(ctx.amrapSuggestion(), null, 'innerhalb von 14 Tagen nach der Kalibrierung keine neue AMRAP-Karte');
    ctx.AppState.rpeCalib.ts = ctx.Date.now() - 15 * DAY;
    assert.ok(ctx.amrapSuggestion());
  });

  test('4.3 AMRAP-Satz mit RPE unter 9,5 zählt nicht als Kalibrierung', () => {
    const ctx = loadApp({}, { now: '2026-10-19T17:00:00Z' });
    workout(ctx, [{ n: 'Overhead Extension (KH)', s: '3×10-12', done: true, sets: [
      { w: '18', r: '12', rpe: '8', done: true }, { w: '18', r: '12', rpe: '8', done: true }] }]);
    ctx.AppState.activeSession.amrapEx = 'Overhead Extension (KH)';
    ctx.finishWorkout();
    assert.equal(ctx.AppState.rpeOffset, null);
  });

  // ── Phase 5 ──
  test('5 plan3plus1(): 7 Tage, 3 Pflicht-Gymtage, 1 optionaler Tag', () => {
    const p = loadApp({}).plan3plus1();
    assert.equal(p.length, 7);
    assert.equal(p.filter((d) => d.type === 'gym' && !d.optional).length, 3);
    assert.equal(p.filter((d) => d.optional === true).length, 1);
  });

  test('5 plan3plus1(): simulierte Woche ergibt für hams mindestens 6 Sätze', () => {
    const ctx = loadApp({}, { now: '2026-10-20T20:00:00Z' });
    const days = ctx.plan3plus1().filter((d) => d.type === 'gym' && !d.optional);
    ctx.AppState.history = days.map((d, i) => ({
      ts: Date.parse('2026-10-15T17:00:00Z') + i * 864e5, dayName: d.name, durationMs: 3e6, volume: 0,
      sets: d.ex.flatMap((e) => {
        const n = parseInt(String(e.s), 10) || 3;
        return Array.from({ length: n }, () => (e.timed ? { ex: e.n, secs: 30 } : { ex: e.n, w: 50, r: 10, rpe: 8 }));
      }),
    }));
    const hams = ctx.weeklyMuscleSets().hams || 0;
    assert.ok(hams >= 6, `hams ${hams}`);
  });

  test('5 plan3plus1(): bestehende Übungsnamen unverändert, Copenhagen Adduction als timed-Variante', () => {
    const ctx = loadApp({});
    const known = new Set([
      ...ctx.defaultPlan().flatMap((d) => d.ex.map((e) => e.n)),
      ...ctx.EXERCISE_FAMILIES.flatMap((f) => f.variants.map((v) => v.n)),
    ]);
    const neu = ctx.plan3plus1().flatMap((d) => d.ex.map((e) => e.n)).filter((n) => !known.has(n));
    assert.deepEqual([...new Set(neu)], [], `unbekannte Namen: ${neu.join(', ')}`);
    const cop = ctx.EXERCISE_FAMILIES.flatMap((f) => f.variants).find((v) => v.n === 'Copenhagen Adduction');
    assert.ok(cop && cop.timed === true, 'Copenhagen Adduction fehlt oder ist nicht timed');
  });

  test('5 plan3plus1(): Zielvolumen direkter Sätze laut Spec (Brust 12, Rücken 13, Quads 7, Hams 7 …)', () => {
    const ctx = loadApp({});
    const direct = {};
    for (const d of ctx.plan3plus1().filter((x) => x.type === 'gym' && !x.optional)) {
      for (const e of d.ex) {
        const n = parseInt(e.s, 10);
        for (const m of ctx.musclesFor(e.n)) if (m.w === 1) direct[m.m] = (direct[m.m] || 0) + n;
      }
    }
    const soll = { brust: 12, ruecken: 13, trizeps: 6, bizeps: 5, quads: 7, hams: 7, wade: 3 };
    for (const [m, n] of Object.entries(soll)) assert.equal(direct[m], n, m);
    const seitlich = ctx.plan3plus1().filter((x) => !x.optional).flatMap((d) => d.ex)
      .filter((e) => /seitheb/i.test(e.n)).reduce((a, e) => a + parseInt(e.s, 10), 0);
    assert.equal(seitlich, 6, 'Schulter seitlich');
    assert.ok(ctx.plan3plus1().every((d) => d.ex.every((e) => /^\d+×\d+(-\d+)?s?$/.test(e.s))), 'Format 3×8-10');
  });

  test('5 Vorlage übernehmen: Bestätigungsdialog (kein confirm), Historie und PRs bleiben', () => {
    const fx = { history: [{ ts: Date.parse('2026-10-12T17:00:00Z'), dayName: 'Push A', durationMs: 3e6, volume: 0,
      sets: [{ ex: 'Bankdrücken (LH)', w: 110, r: 8, rpe: 8 }] }] };
    const ctx = loadApp(fx, { now: '2026-10-19T08:00:00Z' });
    const prs = JSON.stringify(ctx.AppState.prs);
    ctx.offerPlan3plus1();
    const dlg = ctx.document.getElementById('appDialog');
    assert.equal(dlg.style.display, 'flex');
    assert.match(dlg.innerHTML, /Vorlage &quot;3\+1 Fußball&quot; übernehmen\?/);
    assert.match(dlg.innerHTML, /Historie und PRs bleiben unverändert/);
    assert.equal(ctx.AppState.plan[0].name, 'Push A', 'vor der Bestätigung unverändert');
    ctx.closeConfirmDialog();
    assert.equal(ctx.AppState.plan[0].name, 'Push A', 'Abbrechen ändert nichts');
    ctx.offerPlan3plus1();
    ctx.confirmDialogOk();
    assert.equal(ctx.AppState.plan[0].name, 'Upper A');
    assert.equal(ctx.AppState.history.length, 1);
    assert.equal(JSON.stringify(ctx.AppState.prs), prs);
    assert.equal(JSON.parse(ctx.localStorage.getItem('kinetic.planSource')), 'custom', 'vor PLAN_VERSION-Updates geschützt');
    assert.equal(JSON.parse(ctx.localStorage.getItem('kinetic.plan'))[3].optional, true);
    ctx.renderPlan();
    assert.match(ctx.document.getElementById('planList').innerHTML, /OPTIONAL/);
    const info = ctx.document.getElementById('planInfo').innerHTML;
    assert.match(info, /3× Gym \+ 1 optional · 2× Fußball \+ Spiel/);
    assert.match(info, /Brust <strong[^>]*>12<\/strong>/);
    assert.match(info, /Quad\/Ham <strong[^>]*>7<\/strong>\/<strong[^>]*>7<\/strong>/);
  });

  test('5 Adherence-Karte bietet "3+1-Plan übernehmen" an; optionaler Tag zählt nicht', () => {
    const ctx = loadApp({ history: [] }, { now: '2026-10-22T08:00:00Z' });   // Donnerstag
    ctx.AppState.plan = ctx.plan3plus1();
    assert.notEqual(ctx.upcomingGymDay().day.name, 'Arme + Schulter + Core');
    assert.equal(ctx.planMuscles().core, undefined, 'Plank nur am optionalen Tag → keine Core-Warnung');
  });

  // ── Phase 6 ──
  function notifsHtml(state, now) {
    const ctx = loadApp(state, { now });
    ctx.renderSmartNotifs();
    return ctx.document.getElementById('smartNotifs').innerHTML;
  }

  test('6.1 Montags Gewicht-Karte, wenn letzter weightLog-Eintrag älter als 7 Tage', () => {
    const mo = '2026-10-19T07:00:00Z';   // Montag
    assert.match(notifsHtml({ weightLog: [{ w: 105, d: '2026-10-10' }] }, mo), /Montags-Wiegen.*Letzter Eintrag vor 9 Tagen/s);
    assert.match(notifsHtml({ weightLog: [] }, mo), /Montags-Wiegen.*Noch kein Gewicht eingetragen/s);
    assert.match(notifsHtml({ weightLog: [{ w: 105, d: '2026-10-12' }] }, mo), /Montags-Wiegen/, 'Vormontag (7 Tage) → wieder fällig');
    assert.doesNotMatch(notifsHtml({ weightLog: [{ w: 105, d: '2026-10-15' }] }, mo), /Montags-Wiegen/);
    assert.doesNotMatch(notifsHtml({ weightLog: [{ w: 105, d: '2026-10-19' }] }, mo), /Montags-Wiegen/, 'heute gewogen');
    assert.doesNotMatch(notifsHtml({ weightLog: [{ w: 105, d: '2026-10-01' }] }, '2026-10-20T07:00:00Z'), /Montags-Wiegen/, 'nur montags');
    // Reihenfolge im Log egal (Import kann unsortiert sein)
    assert.doesNotMatch(notifsHtml({ weightLog: [{ w: 105, d: '2026-09-01' }, { w: 104, d: '2026-10-18' }] }, mo), /Montags-Wiegen/);
  });
  test('6.2 Luna-Erinnerung, wenn wearableLog seit 3 Tagen leer ist', () => {
    const di = '2026-10-20T07:00:00Z';
    const entry = (d) => ({ d, hrv: 55, rhr: 52, sleep: 7.5 });
    assert.match(notifsHtml({ wearableLog: [] }, di), /Luna-Check-in.*Noch keine Wearable-Daten/s);
    assert.match(notifsHtml({ wearableLog: [entry('2026-10-17')] }, di), /Luna-Check-in.*Seit 3 Tagen keine Wearable-Daten/s);
    assert.doesNotMatch(notifsHtml({ wearableLog: [entry('2026-10-18')] }, di), /Luna-Check-in/);
    assert.doesNotMatch(notifsHtml({ wearableLog: [entry('2026-10-20')] }, di), /Luna-Check-in/);
  });

  test('6.1/6.2 Montag ohne Gewicht und ohne Luna-Daten: beide Karten sichtbar', () => {
    const html = notifsHtml({ weightLog: [], wearableLog: [] }, '2026-10-19T07:00:00Z');
    assert.match(html, /Montags-Wiegen/);
    assert.match(html, /Luna-Check-in/);
  });

  test('6 Neue Karten verdrängen die Backup-Erinnerung nicht', () => {
    // 6 Workouts ohne Backup + Montag ohne Gewicht/Luna + gewohnheitsmäßige RPE
    const hist = rpeHistory(40).concat([1, 2].map((k) => session(`2026-10-1${k + 5}`, [{ ex: 'Seitheben (Kabel)', w: 20, r: 14, rpe: 8 }])));
    const html = notifsHtml({ history: hist, weightLog: [], wearableLog: [] }, '2026-10-19T07:00:00Z');
    assert.match(html, /Backup empfohlen/);
    assert.equal((html.match(/class="sm-banner/g) || []).length, 4);
    assert.ok(html.indexOf('Readiness') < html.indexOf('Backup empfohlen'), 'Readiness bleibt vorn');
  });

  // ── Phase 7 ──
  test('7.2 sw.js: CACHE = kinetic-v2', () => {
    const sw = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
    assert.match(sw, /CACHE\s*=\s*['"]kinetic-v2['"]/);
  });

  test('7.2 Version ist in der App sichtbar (Profil > Daten) und passt zum Cache', () => {
    const ctx = loadApp({});
    ctx.refreshDataPage();
    assert.match(ctx.document.getElementById('appVersion').textContent, /Coach v2 \(kinetic-v2\)/);
  });
}
