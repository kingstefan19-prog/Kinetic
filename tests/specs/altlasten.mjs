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

  test('B3 Alte Übungsnamen werden beim Lesen zugeordnet; Historie bleibt unverändert', () => {
    const S = (d, ex, w, r) => ({ ts: Date.parse(`${d}T17:00:00Z`), dayName: 'Alt', durationMs: 3e6, volume: 0, sets: [{ ex, w, r, rpe: 8 }] });
    const hist = [S('2026-09-01', 'Kniebeuge', 120, 5), S('2026-09-08', 'Rudern (LH)', 70, 8), S('2026-09-15', 'Schulterdrücken', 28, 8),
      S('2026-09-22', 'Latzug', 70, 10), S('2026-09-29', 'Seitheben', 15, 12), S('2026-10-20', 'Kniebeuge (LH)', 125, 5)];
    const c = loadApp({ history: hist }, { now: '2026-11-10T08:00:00Z' });
    const before = JSON.stringify(c.AppState.history);
    assert.equal(c.canonicalEx('Kniebeuge'), 'Kniebeuge (LH)');
    for (const n of ['Kniebeuge (LH)', 'Rudern (LH Untergriff)', 'Schulterdrücken (KH sitzend)', 'Latzug (Untergriff eng)', 'Seitheben (Kabel)']) assert.ok(c.AppState.prs[n] > 0, n);
    for (const n of ['Kniebeuge', 'Rudern (LH)', 'Schulterdrücken', 'Latzug', 'Seitheben']) assert.equal(c.AppState.prs[n], undefined, n);
    assert.equal(c.e1rmHistory('Kniebeuge (LH)').length, 2, 'beide Namen zusammengeführt');
    c.renderStrengthCard();
    const card = c.document.getElementById('strengthCard').innerHTML;
    assert.match(card, /Kniebeuge \(LH\)/);
    assert.doesNotMatch(card, />Kniebeuge</);
    c.renderBenchmarks();
    const b = c.document.getElementById('benchmarkList').innerHTML;
    assert.match(b, /Kniebeuge \(LH\)/);
    assert.doesNotMatch(b, /Elite|Fortgeschritten|Aufbau/);
    assert.equal(JSON.stringify(c.AppState.history), before, 'Historie nicht umgeschrieben');
    assert.doesNotMatch(html(), /BENCH_STD=/);
  });

  test('B4 FFMI wird aus Gewicht, Größe und KFA berechnet, nie gespeichert', () => {
    const c = loadApp({ user: { name: 'Test', weight: 80, height: 180, kfa: 15, ffmi: 99.9 } }, { now: '2026-11-10T08:00:00Z' });
    assert.equal(c.AppState.user.ffmi, undefined, 'gespeicherter FFMI verworfen');
    assert.equal(c.ffmiOf(c.AppState.user), 21);
    assert.equal(c.ffmiOf({ weight: 80, height: 180 }), null, 'ohne KFA kein FFMI');
    c.renderHeroStats();
    assert.match(c.document.getElementById('heroStats').innerHTML, />21</);
    // Import eines alten Backups mit gespeichertem FFMI: neu berechnet
    c.applyBackupState({ version: 2, user: { weight: 90, height: 180, kfa: 20, ffmi: 12.3 } });
    assert.equal(c.AppState.user.ffmi, undefined);
    assert.equal(c.ffmiOf(c.AppState.user), 22.2);
    c.AppState.save();
    assert.equal(c.DB.get('user', {}).ffmi, undefined, 'nicht gespeichert');
  });
}
