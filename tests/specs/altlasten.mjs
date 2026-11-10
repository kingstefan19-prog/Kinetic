// feat/athlete-mode Phase B – Fehler und Altlasten
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Altlasten · Banner, Übungsnamen, FFMI, Standardwerte, Notizen, Daten prüfen';

const plain = (x) => JSON.parse(JSON.stringify(x));

export default function ({ test, assert, loadApp, REPO_ROOT }) {
  const html = () => fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

  test('B2 Kein statischer Banner "Plan v5 geladen" mehr', () => {
    assert.doesNotMatch(html(), /plan-update-banner|Plan v5 geladen/);
  });
}
