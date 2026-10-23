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
}
