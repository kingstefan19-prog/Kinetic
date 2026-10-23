// Erzeugt die synthetischen Test-Fixtures (docs/UPGRADE-SPEC.md, Phase 0.4).
// KEINE echten Daten: alle Werte sind frei erfunden und deterministisch.
//
// Aufruf:  node tests/make-fixtures.mjs
// Ergebnis: tests/fixtures/*.json im Backup-Format (version 2), plus
// "_fixture" mit Beschreibung und fixem "now" für die Harness-Uhr.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const USER = { name: 'Testathlet', age: 30, weight: 100, height: 185, kfa: 18, kfaGoal: 14, kcalTarget: 2800 };

// n gleiche Sätze
function sets(ex, n, w, r, rpe) {
  return Array.from({ length: n }, () => ({ ex, w, r, rpe }));
}
// Sätze mit individuellen Wdh/RPE: [[w,r,rpe], …]
function setList(ex, rows) {
  return rows.map(([w, r, rpe]) => ({ ex, w, r, rpe }));
}
function session(date, dayName, allSets, durationMs = 55 * MIN) {
  const flat = allSets.flat().map((s) => Object.assign({}, s, { pr: false }));
  const volume = flat.reduce((a, s) => a + (s.w && s.r ? s.w * s.r : 0), 0);
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs, volume, sets: flat };
}
function backup(name, description, now, spec, state) {
  return {
    version: 2,
    ts: Date.parse(now),
    _fixture: { name, description, now, spec, synthetic: true },
    state: Object.assign({
      user: Object.assign({}, USER),
      streak: 0, lastStreakDate: null,
      history: [], weightLog: [], sleepLog: [], wearableLog: [], meals: [],
    }, state),
  };
}

const fixtures = {};

// ── bodyweight-plateau ───────────────────────────────────────────────────
// Klimmzüge 4×10 in 3 Sessions hintereinander, w = 105 (= Körpergewicht).
fixtures['bodyweight-plateau'] = backup(
  'bodyweight-plateau',
  'Klimmzüge 4×10 in 3 Sessions hintereinander (w = 105), Körpergewicht 105 kg',
  '2026-10-20T08:00:00Z', '2.1',
  {
    user: Object.assign({}, USER, { weight: 105 }),
    weightLog: [{ w: 105, d: '2026-10-15' }],
    history: ['2026-10-08', '2026-10-13', '2026-10-17'].map((d) =>
      session(d, 'Pull A', [sets('Klimmzüge', 4, 105, 10, 8)])),
  });

// ── bench-oscillation ────────────────────────────────────────────────────
// Bankdrücken (LH) 110 kg mit 8,8,6,5 Wdh bei RPE 8. Die Session davor lag
// ebenfalls bei 110 kg (kein frischer Gewichtssprung).
fixtures['bench-oscillation'] = backup(
  'bench-oscillation',
  'Bankdrücken (LH) 110 kg mit 8,8,6,5 Wdh, RPE 8 (Vorwoche ebenfalls 110 kg)',
  '2026-10-20T08:00:00Z', '2.2',
  {
    history: [
      session('2026-10-12', 'Push A', [setList('Bankdrücken (LH)', [[110, 7, 8], [110, 7, 8], [110, 6, 8], [110, 5, 8]])]),
      session('2026-10-19', 'Push A', [setList('Bankdrücken (LH)', [[110, 8, 8], [110, 8, 8], [110, 6, 8], [110, 5, 8]])]),
    ],
  });

// ── outliers ─────────────────────────────────────────────────────────────
// Genau drei Ausreißer nach den Kriterien aus 1.4:
//  1) Skull Crushers (LH) 125×12 (> 2× Median 25)
//  2) ein Satz mit RPE 78
//  3) eine Session mit durationMs = 48 h
fixtures.outliers = backup(
  'outliers',
  'Drei Datenfehler: Skull Crushers 125×12 (Tippfehler), RPE 78, Session-Dauer 48 h',
  '2026-10-01T08:00:00Z', '1.4',
  {
    history: [
      session('2026-09-20', 'Upper B (2. Frequenz)', [
        setList('Skull Crushers (LH)', [[18, 8, 6], [25, 10, 7], [125, 12, 7]]),
        sets('Hammer Curl (KH)', 3, 16, 12, 8),
      ], 50 * MIN),
      session('2026-09-23', 'Push A', [
        setList('Trizeps Pushdown (Seil)', [[50, 12, 7], [50, 12, 78], [50, 11, 8]]),
      ], 55 * MIN),
      session('2026-09-25', 'Pull A', [
        sets('Latzug (Untergriff eng)', 3, 80, 11, 8),
      ], 48 * HOUR),
    ],
  });

// ── skipped-legs ─────────────────────────────────────────────────────────
// 3 Wochen nur Push A (Mo), Pull A (Mi), Upper B (Sa) – kein Legs-Tag.
// Zwei Upper-B-Sessions tragen Namenszusätze, die 3.3 beim Matchen
// entfernen muss.
const PUSH_A = () => [
  sets('Bankdrücken (LH)', 4, 100, 7, 8),
  sets('Schrägbankdrücken (KH)', 3, 34, 10, 8),
  sets('Kabelflys (untere Rolle)', 3, 25, 13, 8),
  sets('Schulterdrücken (KH sitzend)', 4, 28, 9, 8),
  sets('Seitheben (KH)', 3, 12, 14, 8),
  sets('Trizeps Pushdown (Seil)', 3, 50, 11, 8),
  sets('Overhead Extension (KH)', 3, 16, 11, 8),
];
const PULL_A = () => [
  sets('Klimmzüge', 4, 100, 9, 8),
  sets('Latzug (Untergriff eng)', 3, 80, 11, 8),
  sets('Rudern (LH Untergriff)', 4, 80, 9, 8),
  sets('Seilzugrudern (eng)', 3, 65, 13, 7),
  sets('Bizeps Curl (LH)', 3, 32, 9, 8),
  sets('Incline Curl (KH) 45°', 3, 12, 12, 8),
  sets('Face Pulls (Kabel)', 3, 45, 14, 7),
];
const UPPER_B = () => [
  sets('Schrägbank Bankdrücken (LH)', 3, 80, 7, 8),
  sets('Pec Deck / Maschinen-Flys', 3, 70, 13, 8),
  sets('Seitheben (Kabel)', 4, 15, 14, 8),
  sets('Skull Crushers (LH)', 3, 25, 10, 7),
  sets('Einarmiges KH-Rudern', 4, 40, 9, 8),
  sets('Kabel-Pullover (stehend)', 3, 57.5, 13, 8),
  sets('Hammer Curl (KH)', 3, 16, 13, 7),
];
fixtures['skipped-legs'] = backup(
  'skipped-legs',
  '3 Wochen nur Push A / Pull A / Upper B, kein Legs-Tag (Standardplan)',
  '2026-10-20T08:00:00Z', '3.1/3.3',
  {
    history: [
      session('2026-09-30', 'Pull A', PULL_A()),
      session('2026-10-03', 'Upper B (2. Frequenz)', UPPER_B()),
      session('2026-10-05', 'Push A', PUSH_A()),
      session('2026-10-07', 'Pull A', PULL_A()),
      session('2026-10-10', 'Upper B (2. Frequenz) (KI-optimiert)', UPPER_B()),
      session('2026-10-12', 'Push A', PUSH_A()),
      session('2026-10-14', 'Pull A', PULL_A()),
      session('2026-10-17', 'Upper B (2. Frequenz) (optimiert)', UPPER_B()),
      session('2026-10-19', 'Push A', PUSH_A()),
    ],
  });

// ── post-layoff ──────────────────────────────────────────────────────────
// Schrägbankdrücken (KH) 42 kg × 9 in den 2 Sessions vor einer 25-Tage-Pause,
// danach 34 kg × 10 bei Ø RPE 6,7 (7 / 6,5 / 6,5).
fixtures['post-layoff'] = backup(
  'post-layoff',
  'Schrägbankdrücken (KH) 42×9 vor 25 Tagen Pause, danach 34×10 bei Ø RPE 6,7',
  '2026-10-10T08:00:00Z', '2.6',
  {
    history: [
      session('2026-09-05', 'Push A', [sets('Schrägbankdrücken (KH)', 3, 42, 9, 8)]),
      session('2026-09-12', 'Push A', [sets('Schrägbankdrücken (KH)', 3, 42, 9, 8)]),
      session('2026-10-07', 'Push A', [setList('Schrägbankdrücken (KH)', [[34, 10, 7], [34, 10, 6.5], [34, 10, 6.5]])]),
    ],
  });

// ── realistic-3plus1 (fix/integration, Punkt 7) ──────────────────────────
// 10 Wochen plan3plus1 (Mo Upper A, Mi Lower, Sa Upper B; Fußball Di/Fr/So),
// realistische Gewichte. Woche 7: Upper A fällt aus. Woche 9: ein schlechter
// Kniebeugen-Tag (2 Sätze unter Wdh-Ziel). Rumänisches Kreuzheben und Nordic
// werden nie geloggt, der optionale Do nie gemacht – Seitheben (KH) zuletzt
// vor 18 Wochen. Ein einzelner sleepLog-Eintrag (6 h) ist 20 Wochen alt.
{
  const { loadApp } = await import('./harness.mjs');
  const PLAN = JSON.parse(JSON.stringify(loadApp({}).plan3plus1()));
  const MON = Date.parse('2026-08-17T00:00:00Z');                 // Woche 1
  const day = (k, dow) => new Date(MON + (k * 7 + dow) * 24 * HOUR).toISOString().slice(0, 10);
  // Gewicht je Woche (Index = Block): Wochen 1–3, 4–6, 7–10
  const blk = (k) => (k < 3 ? 0 : k < 6 ? 1 : 2);
  const W = {
    'Bankdrücken (LH)': [105, 107.5, 110], 'Schrägbankdrücken (KH)': [34, 34, 36], 'Rudern (LH Untergriff)': [77.5, 80, 80],
    'Seitheben (Kabel)': [20, 20, 20], 'Trizeps Pushdown (Seil)': [57.5, 57.5, 60], 'Bizeps Curl (LH)': [35, 35, 37.5],
    'Kniebeuge (LH)': [140, 145, 150], 'Beinpresse': [190, 195, 200], 'Beinstrecker': [42.5, 42.5, 45],
    'Beinbeuger (Maschine liegend)': [37.5, 40, 40], 'Abduktionsmaschine (sitzend)': [85, 90, 90], 'Wadenheben stehend': [95, 97.5, 100],
    'Schrägbank Bankdrücken (LH)': [85, 87.5, 90], 'Latzug (Untergriff eng)': [85, 87.5, 90], 'Schulterdrücken (KH sitzend)': [30, 32, 32],
    'Einarmiges KH-Rudern': [38, 40, 40], 'Pec Deck / Maschinen-Flys': [75, 77.5, 80], 'Overhead Extension (KH)': [16, 16, 18],
    'Face Pulls (Kabel)': [40, 40, 42.5], 'Hammer Curl (KH)': [16, 18, 18],
  };
  const KLIMM_ADD = [0, 0, 2.5];
  const NIE = /Rumänisches Kreuzheben|Nordic/;
  // Wdh steigen innerhalb des Blocks um 1 pro Woche (nie über die Obergrenze), letzte 2 Sätze −1
  function rowsFor(e, k) {
    const m = String(e.s).match(/^(\d+)×(\d+)(?:-(\d+))?/);
    const n = +m[1], lo = +m[2], hi = +(m[3] || m[2]);
    const r = Math.min(hi, lo + 1 + (k - [0, 3, 6][blk(k)]));
    return Array.from({ length: n }, (_, i) => Math.max(lo, i >= n - 2 ? r - 1 : r));
  }
  function daySets(name, k) {
    const d = PLAN.find((x) => x.name === name);
    return d.ex.filter((e) => !NIE.test(e.n)).map((e) => {
      if (e.timed) return Array.from({ length: parseInt(e.s, 10) }, () => ({ ex: e.n, secs: 25 }));
      if (e.n === 'Klimmzüge') {
        const add = KLIMM_ADD[blk(k)];
        return rowsFor(e, k).map((r) => ({ ex: e.n, w: 100 + add, add, r, rpe: 8 }));
      }
      // Woche 9: schlechter Kniebeugen-Tag (6, 4, 4 – zwei Sätze unter dem Ziel)
      if (e.n === 'Kniebeuge (LH)' && k === 8) return setList(e.n, [[150, 6, 9], [150, 4, 10], [150, 4, 10]]);
      return rowsFor(e, k).map((r, i) => ({ ex: e.n, w: W[e.n][blk(k)], r, rpe: i < 1 ? 7.5 : 8 }));
    });
  }
  const history = [
    session('2026-06-22', 'Arme + Schulter + Core', [setList('Seitheben (KH)', [[14, 12, 8], [14, 12, 8], [14, 11, 8]])]),
  ];
  for (let k = 0; k < 10; k++) {
    if (k !== 6) history.push(session(day(k, 0), 'Upper A', daySets('Upper A', k), 68 * MIN));   // Woche 7: Upper A fällt aus
    history.push(session(day(k, 2), 'Lower', daySets('Lower', k), 62 * MIN));
    history.push(session(day(k, 5), 'Upper B', daySets('Upper B', k), 66 * MIN));
  }
  fixtures['realistic-3plus1'] = backup(
    'realistic-3plus1',
    '10 Wochen plan3plus1 mit realistischen Gewichten; Woche 7 ohne Upper A, Woche 9 schlechter Kniebeugen-Tag, '
      + 'RDL/Nordic nie geloggt, Seitheben (KH) zuletzt vor 18 Wochen, ein sleepLog-Eintrag 20 Wochen alt',
    '2026-10-26T06:00:00Z', 'fix/integration 7',
    {
      plan: PLAN,
      history,
      sleepLog: [{ h: 6, d: '2026-06-08' }],
      weightLog: [{ w: 100, d: '2026-10-19' }],
    });
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(fixtures)) {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ ${path.relative(process.cwd(), file)}  (${data.state.history.length} Sessions)`);
}
