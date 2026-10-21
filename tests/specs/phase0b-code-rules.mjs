// Code-Regeln aus CLAUDE.md und den früheren Vorgaben (statische Prüfungen)
export const title = 'Phase 0 · Code-Regeln (statisch, aus CLAUDE.md)';

export default function ({ test, todo, assert, appSource, REPO_ROOT }) {
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

  todo('Keine alert()/confirm()/prompt() (CLAUDE.md) – aktuell 2× confirm: Plan-Reset, Schattenkopie-Restore', () => {
    // .prompt( als Methode (PWA-Install-Event) ist erlaubt, nur die globalen Dialoge nicht
    const hits = src.split('\n')
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => /(^|[^.\w$])(alert|confirm|prompt)\s*\(/.test(l) && !/^\s*\/\//.test(l));
    assert.equal(hits.length, 0, `${hits.length} Aufrufe: ${hits.map((h) => h.l.trim().slice(0, 50)).join(' | ')}`);
  });
}
