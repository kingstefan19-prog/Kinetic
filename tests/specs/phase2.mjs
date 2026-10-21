// Phase 2: Coach-Logik – Akzeptanzkriterien (TODO bis zur Umsetzung)
export const title = 'Phase 2 · Coach-Logik';

function session(date, ex, rows) {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName: 'Test', durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}

export default function ({ todo, assert, loadApp, loadFixture }) {
  todo('2.1 bodyweight-plateau: Hinweis "+2,5 kg" und reps = 6', () => {
    const r = loadApp(loadFixture('bodyweight-plateau')).coachSuggestion('Klimmzüge', '4×6-10');
    assert.match(r.hint, /\+2,5 kg/);
    assert.equal(r.reps, 6);
  });

  todo('2.1 UI: Feld "Zusatz (kg)", gespeichert als w = Körpergewicht + Zusatz plus Feld add');

  todo('2.2 bench-oscillation (8,8,6,5): KEINE Steigerung', () => {
    const r = loadApp(loadFixture('bench-oscillation')).coachSuggestion('Bankdrücken (LH)', '4×5-8');
    assert.ok(r.weight === null || r.weight <= 110, `Vorschlag ${r.weight} kg`);
  });

  todo('2.2 Bankdrücken 8,8,8,8 bei 110 kg → 112,5 kg', () => {
    const fx = loadFixture('bench-oscillation');
    const last = fx.state.history[fx.state.history.length - 1];
    last.sets.forEach((s) => { if (s.ex === 'Bankdrücken (LH)') s.r = 8; });
    const r = loadApp(fx).coachSuggestion('Bankdrücken (LH)', '4×5-8');
    assert.equal(r.weight, 112.5);
  });

  todo('2.2 loadIncrement Langhantel: 2,5 kg bis 140 kg, Oberkörper-Grundübungen immer 2,5 kg', () => {
    const ctx = loadApp({});
    assert.equal(ctx.loadIncrement(120, 'Kniebeuge (LH)'), 2.5);
    assert.equal(ctx.loadIncrement(150, 'Kniebeuge (LH)'), 5);
    assert.equal(ctx.loadIncrement(150, 'Bankdrücken (LH)'), 2.5);
    assert.equal(ctx.loadIncrement(110, 'Rudern (LH Untergriff)'), 2.5);
  });

  todo('2.2 Kurzhantel-Sprünge sind Vielfache von plateStep (keine 36,5-kg-Hanteln)', () => {
    const ctx = loadApp({});
    for (const w of [10, 20, 24, 30, 36, 40]) {
      const inc = ctx.loadIncrement(w, 'Schrägbankdrücken (KH)');
      const step = ctx.plateStep('Schrägbankdrücken (KH)', w);
      assert.equal(inc % step, 0, `${w} kg: +${inc} ist kein Vielfaches von ${step}`);
    }
  });

  todo('2.3 Obergrenze +2 Wdh in einem Satz → "Gewicht zu leicht" und Steigerung', () => {
    const ctx = loadApp({ history: [session('2026-10-15', 'Seitheben (KH)', [[12, 17, 8], [12, 13, 8], [12, 13, 8]])] },
      { now: '2026-10-20T08:00:00Z' });
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.ok(r.weight > 12, `Vorschlag ${r.weight} kg`);
    assert.match(r.hint, /zu leicht/i);
  });

  todo('2.4 Geräteschritt pro Übung (AppState.equipSteps) wird von plateStep/loadIncrement genutzt', () => {
    const ctx = loadApp({ equipSteps: { 'Seitheben (Kabel)': 5 } });
    assert.equal(ctx.plateStep('Seitheben (Kabel)', 15), 5);
    assert.equal(ctx.loadIncrement(15, 'Seitheben (Kabel)'), 5);
  });

  todo('2.4 Schritt > 15 % der Last → "erst bis Obergrenze + 3 Wdh, dann steigern"');

  todo('2.5 Ø RPE ≤ 7 in 2 Sessions hintereinander und Wdh im Zielbereich → echte Steigerung', () => {
    const ctx = loadApp({ history: [
      session('2026-10-12', 'Schrägbankdrücken (KH)', [[34, 10, 7], [34, 10, 7], [34, 10, 7]]),
      session('2026-10-16', 'Schrägbankdrücken (KH)', [[34, 10, 7], [34, 10, 6.5], [34, 10, 7]]),
    ] }, { now: '2026-10-20T08:00:00Z' });
    assert.equal(ctx.coachSuggestion('Schrägbankdrücken (KH)', '3×8-12').weight, 36);
  });

  todo('2.6 post-layoff: 36 kg statt 34 kg und Hinweis "Vor der Pause: 42 kg × 9"', () => {
    const r = loadApp(loadFixture('post-layoff')).coachSuggestion('Schrägbankdrücken (KH)', '3×8-12');
    assert.equal(r.weight, 36);
    assert.match(r.hint, /Vor der Pause: 42 kg × 9/);
  });
}
