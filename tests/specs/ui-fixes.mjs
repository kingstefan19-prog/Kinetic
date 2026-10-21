// Bugfix-Runde fix/ui-hints – Toast, Satztabelle, Gewichtsschritt, Hinweise
import fs from 'node:fs';
import path from 'node:path';

export const title = 'UI-Fixes · Toast, Satztabelle, Hinweise';

function session(date, ex, rows) {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName: 'Test', durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}

export default function ({ test, assert, loadApp, REPO_ROOT }) {
  test('Fix 1: Nach toast() und navigate() innerhalb von 2 s ist der Toast nicht mehr sichtbar', () => {
    const ctx = loadApp({}, { now: '2026-10-21T10:00:00Z' });
    const t = ctx.document.getElementById('toast');
    ctx.toast('Satz gelöscht');
    assert.equal(t.classList.contains('show'), true);
    ctx.__harness.setNow('2026-10-21T10:00:01.500Z');     // 1,5 s später Seitenwechsel
    ctx.navigate('log');
    assert.equal(t.classList.contains('show'), false, 'Toast bleibt nach dem Seitenwechsel stehen');
  });

  test('Fix 1: Meldungen beim Seitenwechsel (Workout beenden/abbrechen) bleiben sichtbar', () => {
    const ctx = loadApp({}, { now: '2026-10-21T10:00:00Z' });
    const t = ctx.document.getElementById('toast');
    ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now() - 3e6, currentIdx: 0, restEndTs: 0,
      exercises: [{ n: 'Beinstrecker', s: '3×12-15', isTimed: false, coach: {}, done: true, sets: [{ w: '45', r: '12', rpe: '8', done: true }] }] };
    ctx.finishWorkout();
    assert.equal(t.classList.contains('show'), true);
    assert.match(t.textContent, /Workout abgeschlossen|neue PR/);
    // Abbruch (zweiter Tipp bestätigt)
    ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now(), currentIdx: 0, restEndTs: 0, exercises: [] };
    ctx.abortWorkout(); ctx.abortWorkout();
    assert.equal(ctx.AppState.activeSession, null);
    assert.equal(t.classList.contains('show'), true);
    assert.equal(t.textContent, 'Training abgebrochen');
  });

  test('Fix 1: .toast bricht lange Texte um (max-width, white-space normal, zentriert)', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    const rule = (html.match(/\.toast\{[^}]*\}/) || [''])[0];
    assert.match(rule, /max-width:calc\(100vw - 32px\)/);
    assert.match(rule, /white-space:normal/);
    assert.match(rule, /text-align:center/);
    assert.doesNotMatch(rule, /nowrap/);
  });

  test('Fix 2: Satztabelle mit table-layout fixed und colgroup (auch Zeit- und Körpergewichtsübung)', () => {
    const ctx = loadApp({}, { now: '2026-10-21T10:00:00Z' });
    const cases = [
      { n: 'Bankdrücken (LH)', s: '4×5-8', isTimed: false, sets: [{ w: '112.5', r: '10', rpe: '', done: false }] },
      { n: 'Klimmzüge', s: '4×6-10', isTimed: false, sets: [{ w: '', add: '12.5', r: '10', rpe: '', done: false }] },
      { n: 'Plank', s: '3×60s', isTimed: true, sets: [{ secs: '60', rpe: '', done: false }] },
    ];
    for (const ex of cases) {
      ctx.AppState.activeSession = { dayId: 'mon', dayName: 'Test', startTs: ctx.Date.now(), currentIdx: 0, restEndTs: 0,
        exercises: [{ coach: { hint: 'x' }, done: false, ...ex }] };
      ctx.renderWorkout();
      const html = ctx.document.getElementById('workoutContent').innerHTML;
      assert.match(html, /<table style="[^"]*table-layout:fixed/, ex.n);
      assert.match(html, /<colgroup><col style="width:24px"><col><col><col style="width:52px"><col style="width:44px"><col style="width:24px"><\/colgroup>/, ex.n);
      const field = ex.isTimed ? 'secs' : (ex.n === 'Klimmzüge' ? 'add' : 'w');
      assert.match(html, new RegExp(`data-set-field="${field}"[^>]*text-align:center`), ex.n);
      assert.match(html, new RegExp(`data-set-field="${field}"[^>]*min-width:0`), ex.n);
      if (!ex.isTimed) assert.match(html, /data-set-field="r"[^>]*padding:8px 4px;text-align:center/, ex.n);
    }
  });

  test('Fix 3: Gewichtsschritt-Feld zeigt den Standard aus loadIncrement() (Latzug > 70 kg: 5 kg)', () => {
    const ctx = loadApp({ history: [session('2026-10-15', 'Latzug (Untergriff eng)', [[95, 12, 8], [95, 12, 8], [95, 12, 8]])] },
      { now: '2026-10-21T10:00:00Z' });
    const ex = 'Latzug (Untergriff eng)';
    assert.equal(ctx.plateStep(ex, 95), 2.5);
    assert.equal(ctx.loadIncrement(95, ex), 5);
    const sug = ctx.coachSuggestion(ex, '3×10-12');
    assert.equal(sug.weight, 100, 'Vorschlag nutzt +5');
    ctx.AppState.activeSession = { dayId: 'wed', dayName: 'Pull A', startTs: ctx.Date.now(), currentIdx: 0, restEndTs: 0,
      exercises: [{ n: ex, s: '3×10-12', isTimed: false, coach: sug, done: false, sets: [{ w: '100', r: '10', rpe: '', done: false }] }] };
    ctx.renderWorkout();
    let html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /id="equipStepInp"[^>]*placeholder="5"/);
    assert.match(html, /Standard: 5 kg/);
    // eigener Schritt gesetzt: Feld zeigt ihn, "Standard" bleibt der Gerätewert ohne eigenen Schritt
    ctx.AppState.equipSteps[ex] = 2.5;
    ctx.renderWorkout();
    html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /id="equipStepInp"[^>]*value="2.5"/);
    assert.match(html, /Standard: 5 kg/);
    assert.equal(ctx.loadIncrement(95, ex), 2.5, 'eigener Schritt gilt für die Rechnung');
  });

  test('Fix 4: Vor-Pausen-Hinweis nur, wenn Arbeitsgewicht oder E1RM unter der Referenz liegt', () => {
    const SB = 'Schrägbankdrücken (KH)';
    const vor = [session('2026-09-05', SB, [[42, 9, 8], [42, 9, 8], [42, 9, 8]]), session('2026-09-12', SB, [[42, 9, 8], [42, 9, 8], [42, 9, 8]])];
    const hint = (rows) => loadApp({ history: [...vor, session('2026-10-07', SB, rows)] }, { now: '2026-10-10T08:00:00Z' })
      .coachSuggestion(SB, '3×8-12').hint;
    assert.match(hint([[34, 10, 9], [34, 9, 9], [34, 9, 9]]), /Vor der Pause: 42 kg × 9/, 'Gewicht darunter');
    assert.match(hint([[42, 7, 9], [42, 7, 9], [42, 7, 9]]), /Vor der Pause: 42 kg × 9/, 'gleiches Gewicht, E1RM darunter');
    assert.doesNotMatch(hint([[42, 9, 8], [42, 9, 8], [42, 9, 8]]), /Vor der Pause/, 'altes Niveau erreicht');
    assert.doesNotMatch(hint([[44, 9, 8], [44, 9, 8], [44, 8, 8]]), /Vor der Pause/, 'darüber');
    // "oder": Gewicht darunter reicht, auch wenn das E1RM (40×12 ≈ 56) schon über 42×9 (≈ 54,6) liegt
    assert.match(hint([[40, 12, 9], [40, 12, 9], [40, 12, 9]]), /Vor der Pause: 42 kg × 9/);
  });
}
