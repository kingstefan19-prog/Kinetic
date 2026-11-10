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

  test('B5 Keine persönlichen Standardwerte; gespeicherte Nutzerdaten bleiben', () => {
    const fresh = loadApp({}, { now: '2026-11-10T08:00:00Z' });
    const u = fresh.AppState.user;
    for (const k of ['age', 'weight', 'height', 'kfa', 'kfaGoal', 'kcalTarget']) assert.ok(u[k] == null, k + ' ohne Standardwert');
    fresh.renderHeroStats(); fresh.updateProfPreview();
    assert.doesNotMatch(fresh.document.getElementById('profPreview').innerHTML, /190|108|20\.1/);
    const kept = loadApp({ user: { name: 'T', age: 40, weight: 77, height: 175, kfa: 18, kfaGoal: 12, kcalTarget: 2400 } }, { now: '2026-11-10T08:00:00Z' });
    assert.equal(kept.AppState.user.weight, 77);
    assert.equal(kept.AppState.user.kcalTarget, 2400);
    const src = html();
    assert.doesNotMatch(src, /106\.6|kfa:17\.3|ffmi:27\.2|3225|108kg|FFMI 26\.6|Dein FFMI 27/);
  });

  test('B6 Wadenheben stehend: keine Teilwiederholungen nach Muskelversagen', () => {
    const c = loadApp({}, { now: '2026-11-10T08:00:00Z' });
    const notes = [];
    c.defaultPlan().forEach(d => (d.ex || []).forEach(e => { if (e.n === 'Wadenheben stehend') notes.push(e.note || ''); }));
    assert.ok(notes.length > 0);
    for (const n of notes) assert.doesNotMatch(n, /Teilw|Partial|Versagen anh/i);
    // Gespeicherter alter Plan wird beim Laden bereinigt, Übungsname bleibt
    const old = [{ day: 'Lower', ex: [{ n: 'Wadenheben stehend', s: '4×12-15', note: 'Lengthened Partials: 2 Teilwdh unten NACH Muskelversagen anhängen · tiefer Stretch' }] }];
    const m = loadApp({ plan: old }, { now: '2026-11-10T08:00:00Z' });
    const e = m.AppState.plan[0].ex[0];
    assert.equal(e.n, 'Wadenheben stehend');
    assert.equal(e.s, '4×12-15');
    assert.doesNotMatch(e.note, /Teilw|Versagen anh/i);
    assert.doesNotMatch(html(), /Teilwdh unten NACH Muskelversagen|Teilwdh in der unteren/);
  });

  test('B7 Karte "Daten prüfen" auf Heute, solange Ausreißer; PRs danach neu', () => {
    const S = (d, sets, dur) => ({ ts: Date.parse(`${d}T17:00:00Z`), dayName: 'Lower', durationMs: dur || 3e6, volume: 0, sets });
    const hist = [
      S('2026-11-08', [{ ex: 'Kniebeuge (LH)', w: 1000, r: 5, rpe: 8 }]),          // Tippfehler
      S('2026-11-05', [{ ex: 'Kniebeuge (LH)', w: 100, r: 5, rpe: 12 }]),          // RPE ungültig
      S('2026-11-01', [{ ex: 'Kniebeuge', w: 100, r: 5, rpe: 8 }], 5 * 3600000),   // > 4 h, alter Name
      S('2026-10-28', [{ ex: 'Kniebeuge (LH)', w: 95, r: 5, rpe: 8 }]),
    ];
    const c = loadApp({ history: hist }, { now: '2026-11-10T08:00:00Z' });
    assert.equal(c.findDataIssues(false).length, 3);
    c.renderTodayCard();
    const card = () => c.document.getElementById('todayCard').innerHTML;
    assert.match(card(), /Daten prüfen/);
    assert.match(card(), /3 auffällige Einträge/);
    const prBefore = c.AppState.prs['Kniebeuge (LH)'];
    c.openDataCheck('dataCheckToday');
    assert.match(c.document.getElementById('dataCheckToday').innerHTML, /Satz löschen/);
    const wi = c._dcList.findIndex(f => f.kind === 'gewicht');
    c.dcAct(wi, 'delete');
    assert.ok(c.AppState.prs['Kniebeuge (LH)'] < prBefore, 'PR ohne Ausreißer neu berechnet');
    assert.match(card(), /2 auffällige Einträge/);
    c.dcAct(c._dcList.findIndex(f => f.kind === 'rpe'), 'fix', 8);
    c.dcAct(c._dcList.findIndex(f => f.kind === 'dauer'), 'ok');
    assert.equal(c.findDataIssues(false).length, 0);
    c.renderTodayCard();
    assert.doesNotMatch(card(), /Daten prüfen/, 'Karte verschwindet ohne offene Funde');
  });
}
