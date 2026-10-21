// Code-Regeln aus CLAUDE.md und den früheren Vorgaben (statische Prüfungen)
export const title = 'Phase 0 · Code-Regeln (statisch, aus CLAUDE.md)';

export default function ({ test, todo, assert, appSource, loadApp, REPO_ROOT }) {
  const src = appSource();

  test('Kein Optional Chaining (?.) und kein Nullish Coalescing (??) – älteres iOS-Safari', () => {
    const oc = src.match(/[\w)\]]\?\.[\w([]/g) || [];
    const nc = src.match(/\?\?/g) || [];
    assert.equal(oc.length + nc.length, 0, `gefunden: ${[...oc, ...nc].join(' ')}`);
  });

  test('Keine doppelten Funktionsnamen auf oberster Ebene', () => {
    const names = [...src.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm)].map((m) => m[1]);
    const dups = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    assert.deepEqual(dups, []);
  });

  test('Keine alert()/confirm()/prompt() (CLAUDE.md)', () => {
    // .prompt( als Methode (PWA-Install-Event) ist erlaubt, nur die globalen Dialoge nicht
    const hits = src.split('\n')
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => /(^|[^.\w$])(alert|confirm|prompt)\s*\(/.test(l) && !/^\s*\/\//.test(l));
    assert.equal(hits.length, 0, `${hits.length} Aufrufe: ${hits.map((h) => h.l.trim().slice(0, 50)).join(' | ')}`);
  });

  test('Plan-Reset und Schattenkopie-Restore fragen über den App-Dialog', () => {
    const ctx = loadApp({ history: [{ ts: 1, dayName: 'X', durationMs: 1, volume: 0, sets: [] }] });
    ctx.AppState.plan[0].name = 'Eigener Tag';
    ctx.resetToDefaultPlan();
    assert.match(ctx.document.getElementById('appDialog').innerHTML, /Plan zurücksetzen\?/);
    assert.equal(ctx.AppState.plan[0].name, 'Eigener Tag', 'erst nach Bestätigung');
    ctx.confirmDialogOk();
    assert.equal(ctx.AppState.plan[0].name, 'Push A');
    assert.equal(ctx.AppState.history.length, 1);
  });
}
