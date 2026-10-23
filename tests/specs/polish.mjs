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
  test('2 Seitheben (KH) vor 18 Wochen 15 kg × 18, Kabel letzte Woche: Gewicht halten, keine Steigerung', () => {
    const ctx = loadApp({ history: [session('2026-06-17', 'Seitheben (KH)', [[15, 18, 8], [15, 18, 8], [15, 17, 8]]), kabel] },
      { now: '2026-10-21T08:00:00Z' });
    assert.equal(ctx.layoffStatus('Seitheben (KH)'), null, 'keine Pause, weil Kabel-Seitheben läuft');
    const r = ctx.coachSuggestion('Seitheben (KH)', '3×12-15');
    // KH-Raster (Punkt 5): 15 kg gibt es nicht, halten rundet ab (15 → 14), eine Steigerung wäre 16
    assert.equal(r.weight, 14);
    assert.ok(r.weight <= 15, 'keine Steigerung');
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

  // ── 4 Zeitübungen ohne RIR ──
  test('4 Zeitübungen (Copenhagen, Plank): keine Ziel-RIR, keine RIR-Spalte, keine Schnellwahl', () => {
    const PLAN = plain(loadApp({}).plan3plus1());
    for (const [dayId, name, hist] of [['wed', 'Copenhagen Adduction', []], ['thu', 'Plank', []],
      ['wed', 'Copenhagen Adduction', [{ ts: Date.parse('2026-10-21T17:00:00Z'), dayName: 'Lower', durationMs: 3e6, volume: 0,
        sets: [{ ex: 'Copenhagen Adduction', secs: 25 }, { ex: 'Copenhagen Adduction', secs: 25 }] }]]]) {
      const c = loadApp({ plan: plain(PLAN), history: hist }, { now: '2026-10-28T08:00:00Z' });
      c.startWorkout(dayId);
      const s = c.AppState.activeSession;
      s.currentIdx = s.exercises.findIndex((e) => e.n === name);
      assert.equal(s.exercises[s.currentIdx].isTimed, true, name);
      c.renderWorkout();
      const html = c.document.getElementById('workoutContent').innerHTML;
      assert.doesNotMatch(html, /RIR/, `${name}: RIR im Workout`);
      assert.doesNotMatch(html, /data-rir-pick|data-rir-val/, name);
      assert.match(html, /⏱ Zeitübung/);
      assert.match(html, /data-set-field="secs"/);
      assert.match(html, /<colgroup><col style="width:24px"><col><col><col style="width:52px"><col style="width:44px"><col style="width:24px"><\/colgroup>/);
    }
    // Gewichtsübung behält Ziel-RIR und Schnellwahl
    const c = loadApp({ plan: plain(PLAN), history: [] }, { now: '2026-10-28T08:00:00Z' });
    c.startWorkout('wed');
    c.renderWorkout();
    const html = c.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /data-rir-pick="0"/);
    assert.equal((html.match(/data-rir-val=/g) || []).length, 5);
    assert.match(html, /Ziel RIR/);
  });

  // ── 5 Kurzhantel-Raster ──
  test('5 plateStep/loadIncrement für Kurzhanteln immer 2, auch unter 10 kg; equipSteps hat Vorrang', () => {
    const ctx = loadApp({}, { now: '2026-10-21T08:00:00Z' });
    for (const ex of ['Seitheben (KH)', 'Einarmiges KH-Rudern', 'Hammer Curl (KH)', 'KH-Flys']) {
      assert.equal(ctx.equipmentType(ex).startsWith('db'), true, ex);
      for (const w of [4, 8, 9.5, 10, 15, 42.5]) {
        assert.equal(ctx.plateStep(ex, w), 2, `${ex} ${w}`);
        assert.equal(ctx.loadIncrement(w, ex), 2, `${ex} ${w}`);
      }
    }
    ctx.AppState.equipSteps['Seitheben (KH)'] = 2.5;
    assert.equal(ctx.plateStep('Seitheben (KH)', 15), 2.5);
    assert.equal(ctx.dbGridWeight('Seitheben (KH)', 17.5), 17.5, 'eigener Schritt: kein 2-kg-Raster');
    assert.equal(ctx.plateStep('Seitheben (Kabel)', 15), 1.25, 'Kabel unverändert');
  });

  test('5 Einarmiges KH-Rudern 42,5 kg × 10 an der Obergrenze → 44 kg; halten → 42 kg', () => {
    const KR = 'Einarmiges KH-Rudern';
    const top = loadApp({ history: [session('2026-10-17', KR, [[42.5, 10, 8], [42.5, 10, 8], [42.5, 10, 8]])] }, { now: '2026-10-21T08:00:00Z' })
      .coachSuggestion(KR, '3×8-10');
    assert.equal(top.weight, 44);
    assert.match(top.hint, /\+2 kg/);
    const hold = loadApp({ history: [session('2026-10-17', KR, [[42.5, 9, 8], [42.5, 9, 8], [42.5, 8, 8]])] }, { now: '2026-10-21T08:00:00Z' })
      .coachSuggestion(KR, '3×8-10');
    assert.equal(hold.weight, 42);
  });

  test('5 Seitheben (KH) mit 15 kg: nie 17 kg, jeder Vorschlag gerade (Steigerung 16, halten 14)', () => {
    const SH = 'Seitheben (KH)';
    const cases = {
      top: [[15, 15, 8], [15, 15, 8], [15, 15, 8]], normal: [[15, 13, 8], [15, 13, 8], [15, 12, 8]],
      over: [[15, 18, 8], [15, 14, 8], [15, 13, 8]], low: [[15, 10, 9], [15, 9, 10], [15, 9, 10]],
      easy: [[15, 13, 6.5], [15, 13, 7], [15, 12, 7]], hard: [[15, 13, 9.5], [15, 12, 9.5], [15, 12, 9.5]],
    };
    const seen = {};
    for (const [name, rows] of Object.entries(cases)) {
      for (const [date, now, sleepLog] of [['2026-10-17', '2026-10-21T08:00:00Z', []], ['2026-08-20', '2026-10-21T08:00:00Z', []],
        ['2026-10-17', '2026-10-21T08:00:00Z', [{ h: 4, d: '2026-10-19' }, { h: 4, d: '2026-10-20' }, { h: 4, d: '2026-10-21' }]]]) {
        const hist = [session('2026-10-10', SH, rows), session(date, SH, rows)];
        const r = loadApp({ history: hist, sleepLog }, { now }).coachSuggestion(SH, '3×12-15');
        assert.notEqual(r.weight, 17, `${name}/${date}: ${JSON.stringify(r)}`);
        assert.equal(r.weight % 2, 0, `${name}/${date}: ${JSON.stringify(r)}`);
        seen[name + '/' + date + '/' + sleepLog.length] = r.weight;
      }
    }
    assert.equal(seen['top/2026-10-17/0'], 16, '15 + Steigerung → 16');
    assert.equal(seen['normal/2026-10-17/0'], 14, 'halten → 14');
    assert.equal(seen['easy/2026-10-17/0'], 16, '2 Sessions mit RIR ≥ 3 → 16');
  });

  test('5 Plausibilität: ungerades Kurzhantelgewicht → Rückfrage, Bestätigen übernimmt es', () => {
    const KR = 'Einarmiges KH-Rudern';
    const ctx = loadApp({ history: [session('2026-10-17', KR, [[42, 10, 8]])] }, { now: '2026-10-21T08:00:00Z' });
    const iss = ctx.plausibilityIssue(KR, { w: '42.5', r: '10' }, false, false);
    assert.equal(iss.kind, 'weight');
    assert.equal(iss.msg, 'Kurzhanteln gibt es in 2-kg-Schritten – 42,5 kg korrekt?');
    assert.equal(ctx.plausibilityIssue(KR, { w: '42', r: '10' }, false, false), null);
    assert.equal(ctx.plausibilityIssue(KR, { w: '42.5', r: '10', wOk: 42.5 }, false, false), null, 'schon bestätigt');
    assert.equal(ctx.plausibilityIssue('Bankdrücken (LH)', { w: '42.5', r: '10' }, false, false), null, 'Langhantel unverändert');
    ctx.AppState.equipSteps[KR] = 2.5;
    assert.equal(ctx.plausibilityIssue(KR, { w: '42.5', r: '10' }, false, false), null, 'eigener Geräteschritt hat Vorrang');
    delete ctx.AppState.equipSteps[KR];
    // UI: Satz abhaken → Rückfrage mit Bestätigen
    ctx.AppState.activeSession = { dayId: 'sat', dayName: 'Upper B', startTs: ctx.Date.now(), currentIdx: 0, restEndTs: 0,
      exercises: [{ n: KR, s: '3×8-10', isTimed: false, coach: {}, done: false, sets: [{ w: '42.5', r: '10', rpe: '', done: false }] }] };
    assert.equal(ctx.toggleSetDone(0), 'ask');
    ctx.renderWorkout();
    const html = ctx.document.getElementById('workoutContent').innerHTML;
    assert.match(html, /Kurzhanteln gibt es in 2-kg-Schritten – 42,5 kg korrekt\?/);
    assert.match(html, /id="plausOk"/);
  });
}
