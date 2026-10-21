// Phase 2: Coach-Logik – Akzeptanzkriterien (TODO bis zur Umsetzung)
export const title = 'Phase 2 · Coach-Logik';

function session(date, ex, rows) {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName: 'Test', durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}

export default function ({ test, todo, assert, loadApp, loadFixture }) {
  test('2.1 bodyweight-plateau: Hinweis "+2,5 kg" und reps = 6', () => {
    const r = loadApp(loadFixture('bodyweight-plateau')).coachSuggestion('Klimmzüge', '4×6-10');
    assert.match(r.hint, /\+2,5 kg/);
    assert.equal(r.reps, 6);
    assert.equal(r.add, 2.5);
    assert.equal(r.weight, 107.5, 'weight = Körpergewicht 105 + Zusatz 2,5');
  });

  test('2.1 Mehrheit an der Obergrenze reicht NICHT für Zusatzlast', () => {
    const fx = loadFixture('bodyweight-plateau');
    fx.state.history[2].sets[3].r = 8;          // 10,10,10,8
    const r = loadApp(fx).coachSuggestion('Klimmzüge', '4×6-10');
    assert.equal(r.add, 0);
    assert.equal(r.reps, 10);
  });

  test('2.1 Körpergewicht kommt aus dem Profil, nicht aus dem geloggten w', () => {
    const fx = loadFixture('bodyweight-plateau');
    fx.state.user.weight = 100;                  // abgenommen: Alt-Einträge w = 105
    const r = loadApp(fx).coachSuggestion('Klimmzüge', '4×6-10');
    assert.equal(r.weight, 102.5, `${r.weight}`);
    // Ohne Profilgewicht: neuester weightLog-Eintrag
    const fx2 = loadFixture('bodyweight-plateau');
    delete fx2.state.user.weight;
    fx2.state.weightLog = [{ w: 98, d: '2026-10-18' }, { w: 105, d: '2026-10-01' }];
    const ctx2 = loadApp(fx2);
    ctx2.AppState.user.weight = 0;               // load() setzt sonst den Default
    assert.equal(ctx2.bodyWeightKg(), 98);
  });

  test('2.1 Gespeichert wird w = Körpergewicht + Zusatz plus Feld add; Plank/Nordic ausgenommen', () => {
    const ctx = loadApp(loadFixture('bodyweight-plateau'));
    ctx.AppState.activeSession = { dayId: 'wed', dayName: 'Pull A', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
      exercises: [{ n: 'Klimmzüge', s: '4×6-10', isTimed: false, coach: {}, done: true,
        sets: [{ w: '', add: '2.5', r: '6', rpe: '8', done: true }, { w: '', add: '', r: '7', rpe: '8', done: true }] }] };
    ctx.finishWorkout();
    const sets = ctx.AppState.history[ctx.AppState.history.length - 1].sets;
    assert.deepEqual(JSON.parse(JSON.stringify(sets.map((x) => [x.w, x.add, x.r]))), [[107.5, 2.5, 6], [105, 0, 7]]);
    assert.equal(ctx.isLoadableBodyweight('Plank'), false);
    assert.equal(ctx.isLoadableBodyweight('Nordic Curl (Beinbizeps)'), false);
    assert.equal(ctx.isLoadableBodyweight('Dips (Brust)'), true);
  });

  test('2.1 UI: Körpergewichtsübung zeigt Feld "Zusatz (kg)" statt "kg"', () => {
    const ctx = loadApp(loadFixture('bodyweight-plateau'));
    const day = { id: 'wed', name: 'Pull A', ex: [{ n: 'Klimmzüge', s: '4×6-10' }, { n: 'Latzug (Untergriff eng)', s: '3×10-12' }] };
    ctx.proceedWithWorkout('wed', day, false);
    ctx.renderWorkout();
    let html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /ZUSATZ \(KG\)/);
    assert.match(html, /data-set-field="add"[^>]*value="2.5"/, 'Zusatzlast nicht vorbelegt');
    ctx.AppState.activeSession.currentIdx = 1;
    ctx.renderWorkout();
    html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.doesNotMatch(html, /ZUSATZ/);
    assert.match(html, /data-set-field="w"/);
  });

  test('2.2 bench-oscillation (8,8,6,5): KEINE Steigerung', () => {
    const r = loadApp(loadFixture('bench-oscillation')).coachSuggestion('Bankdrücken (LH)', '4×5-8');
    assert.ok(r.weight === null || r.weight <= 110, `Vorschlag ${r.weight} kg`);
  });

  test('2.2 Bankdrücken 8,8,8,8 bei 110 kg → 112,5 kg', () => {
    const fx = loadFixture('bench-oscillation');
    const last = fx.state.history[fx.state.history.length - 1];
    last.sets.forEach((s) => { if (s.ex === 'Bankdrücken (LH)') s.r = 8; });
    const r = loadApp(fx).coachSuggestion('Bankdrücken (LH)', '4×5-8');
    assert.equal(r.weight, 112.5);
  });

  test('2.2 loadIncrement Langhantel: 2,5 kg bis 140 kg, Oberkörper-Grundübungen immer 2,5 kg', () => {
    const ctx = loadApp({});
    assert.equal(ctx.loadIncrement(120, 'Kniebeuge (LH)'), 2.5);
    assert.equal(ctx.loadIncrement(150, 'Kniebeuge (LH)'), 5);
    assert.equal(ctx.loadIncrement(150, 'Bankdrücken (LH)'), 2.5);
    assert.equal(ctx.loadIncrement(110, 'Rudern (LH Untergriff)'), 2.5);
  });

  test('2.2 Kurzhantel-Sprünge sind Vielfache von plateStep (keine 36,5-kg-Hanteln)', () => {
    const ctx = loadApp({});
    for (const w of [10, 20, 24, 30, 36, 40]) {
      const inc = ctx.loadIncrement(w, 'Schrägbankdrücken (KH)');
      const step = ctx.plateStep('Schrägbankdrücken (KH)', w);
      assert.equal(inc % step, 0, `${w} kg: +${inc} ist kein Vielfaches von ${step}`);
    }
  });

  test('2.2 Isolation behält die Mehrheitsregel', () => {
    const ctx = loadApp({ history: [session('2026-10-15', 'Beinstrecker', [[45, 15, 8], [45, 15, 8], [45, 13, 8]])] },
      { now: '2026-10-20T08:00:00Z' });
    assert.ok(ctx.coachSuggestion('Beinstrecker', '3×12-15').weight > 45);
  });

  test('2.3 Obergrenze +2 Wdh in einem Satz → "Gewicht zu leicht" und Steigerung', () => {
    const ctx = loadApp({ history: [session('2026-10-15', 'Seitheben (KH)', [[16, 17, 8], [16, 13, 8], [16, 13, 8]])] },
      { now: '2026-10-20T08:00:00Z' });
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.equal(r.weight, 18, `Vorschlag ${r.weight} kg`);
    assert.match(r.hint, /Gewicht zu leicht, nächstes Mal steigern/);
  });

  test('2.3 Obergrenze +1 reicht nicht, Körpergewichtsübungen ausgenommen', () => {
    const ctx = loadApp({ history: [session('2026-10-15', 'Seitheben (KH)', [[16, 16, 8], [16, 13, 8], [16, 13, 8]])] },
      { now: '2026-10-20T08:00:00Z' });
    assert.equal(ctx.coachSuggestion('Seitheben (KH)', '3×12-15').weight, 16);
    const bw = loadApp({ history: [session('2026-10-15', 'Klimmzüge', [[105, 12, 8], [105, 8, 8], [105, 8, 8]])] },
      { now: '2026-10-20T08:00:00Z' });
    const r = bw.coachSuggestion('Klimmzüge', '4×6-10');
    assert.doesNotMatch(r.hint, /zu leicht/);
    assert.equal(r.add, 0);
  });

  test('2.4 Geräteschritt pro Übung (AppState.equipSteps) wird von plateStep/loadIncrement genutzt', () => {
    const ctx = loadApp({ equipSteps: { 'Seitheben (Kabel)': 5 } });
    assert.equal(ctx.plateStep('Seitheben (Kabel)', 15), 5);
    assert.equal(ctx.loadIncrement(15, 'Seitheben (Kabel)'), 5);
    assert.equal(ctx.loadIncrement(15, 'Face Pulls (Kabel)'), 1.25, 'andere Übungen unverändert');
  });

  test('2.4 Schritt > 15 % der Last → erst bis Obergrenze + 3 Wdh, dann steigern', () => {
    const hist = (reps) => ({ equipSteps: { 'Seitheben (Kabel)': 5 },
      history: [session('2026-10-15', 'Seitheben (Kabel)', reps.map((r) => [15, r, 8]))] });
    const now = { now: '2026-10-20T08:00:00Z' };
    const hold = loadApp(hist([15, 15, 15]), now).coachSuggestion('Seitheben (Kabel)', '3×12-15');
    assert.equal(hold.weight, 15);
    assert.equal(hold.reps, 16);
    assert.match(hold.hint, /Obergrenze \+ 3/);
    const go = loadApp(hist([18, 18, 18]), now).coachSuggestion('Seitheben (Kabel)', '3×12-15');
    assert.equal(go.weight, 20);
  });

  test('2.4 15-%-Regel greift auch beim Standardschritt (Kurzhantel 12 → 14 kg = 17 %)', () => {
    const ctx = loadApp({ history: [session('2026-10-15', 'Seitheben (KH)', [[12, 15, 8], [12, 15, 8], [12, 15, 8]])] },
      { now: '2026-10-20T08:00:00Z' });
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.equal(r.weight, 12);
    assert.equal(r.reps, 16);
  });

  test('2.4 equipSteps wird gespeichert, exportiert und importiert', () => {
    const ctx = loadApp({ equipSteps: { 'Latzug (Untergriff eng)': 5 } });
    assert.equal(ctx.AppState.equipSteps['Latzug (Untergriff eng)'], 5);
    const bk = JSON.parse(JSON.stringify(ctx.buildBackupObject()));
    assert.equal(bk.state.equipSteps['Latzug (Untergriff eng)'], 5);
    const ctx2 = loadApp({});
    ctx2.applyBackupState(bk.state);
    assert.equal(ctx2.AppState.equipSteps['Latzug (Untergriff eng)'], 5);
    // altes Backup ohne equipSteps bleibt importierbar
    const ctx3 = loadApp({});
    ctx3.applyBackupState({ history: [] });
    assert.equal(typeof ctx3.AppState.equipSteps, 'object');
  });

  test('2.4 UI: Feld "Gewichtsschritt an deinem Gerät" bei Gewichtsübungen', () => {
    const ctx = loadApp(loadFixture('bench-oscillation'));
    ctx.proceedWithWorkout('mon', { id: 'mon', name: 'Push A', ex: [{ n: 'Bankdrücken (LH)', s: '4×5-8' }, { n: 'Klimmzüge', s: '4×6-10' }] }, false);
    ctx.renderWorkout();
    assert.match(ctx.document.getElementById('workoutContent').innerHTML, /Gewichtsschritt an deinem Gerät/);
    ctx.AppState.activeSession.currentIdx = 1;
    ctx.renderWorkout();
    assert.doesNotMatch(ctx.document.getElementById('workoutContent').innerHTML, /Gewichtsschritt an deinem Gerät/);
  });

  test('2.5 Ø RPE ≤ 7 in 2 Sessions hintereinander und Wdh im Zielbereich → echte Steigerung', () => {
    const ctx = loadApp({ history: [
      session('2026-10-12', 'Schrägbankdrücken (KH)', [[34, 10, 7], [34, 10, 7], [34, 10, 7]]),
      session('2026-10-16', 'Schrägbankdrücken (KH)', [[34, 10, 7], [34, 10, 6.5], [34, 10, 7]]),
    ] }, { now: '2026-10-20T08:00:00Z' });
    assert.equal(ctx.coachSuggestion('Schrägbankdrücken (KH)', '3×8-12').weight, 36);
  });

  test('2.5 Nur eine Session mit niedriger RPE → keine Steigerung', () => {
    const ctx = loadApp({ history: [
      session('2026-10-12', 'Schrägbankdrücken (KH)', [[34, 10, 8], [34, 10, 8], [34, 10, 8]]),
      session('2026-10-16', 'Schrägbankdrücken (KH)', [[34, 10, 7], [34, 10, 6.5], [34, 10, 7]]),
    ] }, { now: '2026-10-20T08:00:00Z' });
    assert.equal(ctx.coachSuggestion('Schrägbankdrücken (KH)', '3×8-12').weight, 34);
  });

  test('2.6 post-layoff: 36 kg statt 34 kg und Hinweis "Vor der Pause: 42 kg × 9"', () => {
    const r = loadApp(loadFixture('post-layoff')).coachSuggestion('Schrägbankdrücken (KH)', '3×8-12');
    assert.equal(r.weight, 36);
    assert.match(r.hint, /Vor der Pause: 42 kg × 9/);
  });

  const SB = 'Schrägbankdrücken (KH)';
  const vorPause = [session('2026-09-05', SB, [[42, 9, 8], [42, 9, 8], [42, 9, 8]]),
    session('2026-09-12', SB, [[42, 9, 8], [42, 9, 8], [42, 9, 8]])];

  test('2.6 Wiederaufbau endet am alten Niveau (40 kg → 42 kg, nicht darüber)', () => {
    const ctx = loadApp({ history: [...vorPause, session('2026-10-07', SB, [[40, 10, 7], [40, 10, 7], [40, 10, 7]])] },
      { now: '2026-10-10T08:00:00Z' });
    assert.equal(ctx.coachSuggestion(SB, '3×8-12').weight, 42);
  });

  test('2.6 RPE > 8 → kein Wiederaufbau-Schritt, aber Vor-Pausen-Hinweis', () => {
    const ctx = loadApp({ history: [...vorPause, session('2026-10-07', SB, [[34, 10, 9], [34, 9, 9], [34, 9, 9]])] },
      { now: '2026-10-10T08:00:00Z' });
    const r = ctx.coachSuggestion(SB, '3×8-12');
    assert.equal(r.weight, 34);
    assert.match(r.hint, /Vor der Pause: 42 kg × 9/);
  });

  test('2.6 Erste Session nach der Pause zeigt den Hinweis, nach 4 Sessions verschwindet er', () => {
    const erste = loadApp({ history: vorPause }, { now: '2026-10-07T08:00:00Z' }).coachSuggestion(SB, '3×8-12');
    assert.match(erste.hint, /Vor der Pause: 42 kg × 9/);
    const nach = ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']
      .map((d) => session(d, SB, [[34, 10, 9], [34, 10, 9], [34, 10, 9]]));
    const r = loadApp({ history: [...vorPause, ...nach] }, { now: '2026-10-10T08:00:00Z' }).coachSuggestion(SB, '3×8-12');
    assert.doesNotMatch(r.hint, /Vor der Pause/);
  });
}
