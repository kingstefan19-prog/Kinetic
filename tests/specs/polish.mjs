// fix/polish – Feinschliff nach der Integrationsrunde
export const title = 'Polish · Wdh-Bereiche, veraltete Daten, Hinweise, Zeitübungen, KH-Raster';

const plain = (x) => JSON.parse(JSON.stringify(x));
function session(date, ex, rows, dayName = 'Test') {
  return { ts: Date.parse(`${date}T17:00:00Z`), dayName, durationMs: 3e6, volume: 0,
    sets: rows.map(([w, r, rpe]) => ({ ex, w, r, rpe })) };
}

// Alle Planvorlagen der App: Standardplan, 3+1 Fußball und jede Onboarding-Kombination
function allTemplates(ctx) {
  const out = [['defaultPlan', ctx.defaultPlan()], ['plan3plus1', ctx.plan3plus1()]];
  for (const equipment of ['fullgym', 'basicgym', 'home', 'bw'])
    for (const level of ['beginner', 'intermediate', 'advanced'])
      for (const split of ['auto', 'ppl', 'upperlower', 'fullbody', 'brosplit'])
        for (const gymDays of [2, 3, 4, 5, 6, 7])
          for (const goal of ['recomp', 'bulk', 'cut', 'strength', 'athlete'])
            for (const sport of ['none', 'soccer1', 'soccer2', 'other'])
              out.push([`Onboarding ${equipment}/${level}/${split}/${gymDays}/${goal}/${sport}`,
                ctx.buildOnboardingPlan({ equipment, level, split, gymDays, goal, sport })]);
  return out;
}

export default function ({ test, assert, loadApp }) {
  // ── 1 Gleiche Übung, gleicher Zielbereich ──
  test('1 plan3plus1: Face Pulls (Kabel) am optionalen Tag und in Upper B mit 2×12-15', () => {
    const ctx = loadApp({});
    const plan = ctx.plan3plus1();
    const fp = plain(plan).flatMap((d) => d.ex.filter((e) => e.n === 'Face Pulls (Kabel)').map((e) => `${d.name}: ${e.s}`));
    assert.deepEqual(fp, ['Arme + Schulter + Core: 2×12-15', 'Upper B: 2×12-15']);
    // Gleiche Daten → gleicher Vorschlag an beiden Tagen (vorher "+2,5 kg" bzw. "−7 % Deload")
    const c = loadApp({ plan: plain(plan), history: [session('2026-10-17', 'Face Pulls (Kabel)', [[40, 16, 8], [40, 14, 8]])] },
      { now: '2026-10-21T08:00:00Z' });
    const sugs = c.AppState.plan.flatMap((d) => d.ex.filter((e) => e.n === 'Face Pulls (Kabel)')).map((e) => plain(c.coachSuggestion(e.n, e.s)));
    assert.equal(sugs.length, 2);
    assert.deepEqual(sugs[0], sugs[1]);
    assert.doesNotMatch(sugs[0].hint, /Deload/);
  });

  test('1 Alle Vorlagen: jede Übung hat im ganzen Plan denselben Wdh-Bereich', () => {
    const ctx = loadApp({});
    const templates = allTemplates(ctx);
    assert.ok(templates.length > 7000, `nur ${templates.length} Vorlagen geprüft`);
    for (const [label, plan] of templates) {
      const seen = {};
      for (const d of plan) for (const e of d.ex || []) {
        const r = ctx.parseRepRange(e.s);
        const key = (r ? `${r.lo}-${r.hi}` : String(e.s)) + (e.timed ? ' s' : '');
        if (seen[e.n] === undefined) seen[e.n] = { key, where: d.name };
        else assert.equal(key, seen[e.n].key, `${label}: ${e.n} in ${seen[e.n].where} ${seen[e.n].key}, in ${d.name} ${key}`);
      }
    }
  });

  // ── 2 Keine Steigerung auf veralteten Daten ──
  const kabel = session('2026-10-14', 'Seitheben (Kabel)', [[20, 14, 8], [20, 13, 8]]);
  test('2 Seitheben (KH) vor 18 Wochen 15 kg × 18, Kabel letzte Woche: 15 kg halten, keine Steigerung', () => {
    const ctx = loadApp({ history: [session('2026-06-17', 'Seitheben (KH)', [[15, 18, 8], [15, 18, 8], [15, 17, 8]]), kabel] },
      { now: '2026-10-21T08:00:00Z' });
    assert.equal(ctx.layoffStatus('Seitheben (KH)'), null, 'keine Pause, weil Kabel-Seitheben läuft');
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.equal(r.weight, 15);
    assert.equal(r.reps, 15, 'kein Wdh-Sprung über die Obergrenze');
    assert.equal(r.hint, 'Letztes Mal vor 18 Wochen – Gewicht halten, dann normal weiter.');
    assert.doesNotMatch(r.hint, /\+\d/);
  });

  test('2 Grenze 28 Tage; Körpergewichtsübung hält die Zusatzlast; frische Daten steigern normal', () => {
    const rows = [[15, 18, 8], [15, 18, 8], [15, 17, 8]];
    const at = (date) => loadApp({ history: [session(date, 'Seitheben (KH)', rows), kabel] }, { now: '2026-10-21T08:00:00Z' })
      .coachSuggestion('Seitheben (KH)', '3×12-15');
    assert.match(at('2026-09-21').hint, /^Letztes Mal vor 4 Wochen/, '29 volle Tage');
    assert.doesNotMatch(at('2026-09-22').hint, /Letztes Mal/, '28 volle Tage: normale Logik');
    assert.ok(at('2026-10-10').weight > 15, '11 Tage: Obergrenze geschafft → Steigerung');
    // Klimmzüge vor 6 Wochen mit +5 kg, Latzug lief weiter: Zusatzlast halten
    const kz = { ts: Date.parse('2026-09-10T17:00:00Z'), dayName: 'Test', durationMs: 3e6, volume: 0,
      sets: [{ ex: 'Klimmzüge', w: 105, add: 5, r: 10, rpe: 8 }, { ex: 'Klimmzüge', w: 105, add: 5, r: 10, rpe: 8 }] };
    const c = loadApp({ history: [kz, session('2026-10-14', 'Latzug (Untergriff eng)', [[90, 12, 8]])] }, { now: '2026-10-21T08:00:00Z' });
    const r = c.coachSuggestion('Klimmzüge', '4×6-10');
    assert.equal(r.add, 5);
    assert.match(r.hint, /^Letztes Mal vor 6 Wochen – Gewicht halten/);
  });

  // ── 3 Hinweistext 2.5 ──
  test('3 Zwei Sessions mit RIR ≥ 3: "2 Sessions in Folge mit RIR 3 oder mehr → +2 kg, die Reserve nutzen."', () => {
    const SB = 'Schrägbankdrücken (KH)';
    const ctx = loadApp({ history: [session('2026-10-12', SB, [[34, 10, 7], [34, 10, 7], [34, 10, 7]]),
      session('2026-10-16', SB, [[34, 10, 7], [34, 10, 6.5], [34, 10, 7]])] }, { now: '2026-10-20T08:00:00Z' });
    const r = ctx.coachSuggestion(SB, '3×8-12');
    assert.equal(r.weight, 36);
    assert.equal(r.hint, '2 Sessions in Folge mit RIR 3 oder mehr → +2 kg, die Reserve nutzen.');
    assert.doesNotMatch(r.hint, /Ø RIR|≥/);
  });
}
