// Phase 3: Volumen und Adherence – Akzeptanzkriterien (TODO bis zur Umsetzung)
export const title = 'Phase 3 · Volumen und Adherence';

export default function ({ test, todo, assert, loadApp, loadFixture }) {
  test('3.1 skipped-legs: "nicht trainiert"-Warnungen für quads, hams und wade', () => {
    const advice = loadApp(loadFixture('skipped-legs')).volumeProgressionAdvice();
    for (const m of ['quads', 'hams', 'wade']) {
      const a = advice.find((x) => x.m === m);
      assert.ok(a, `keine Warnung für ${m}`);
      assert.match(a.msg, /nicht trainiert \(0\/\d+\)/);
    }
    assert.ok(advice.slice(0, 3).every((a) => /nicht trainiert/.test(a.msg)), 'nicht trainierte Muskeln stehen vorn');
  });

  test('3.1 Muskeln, die der Plan nicht trainiert, erzeugen keine Warnung; Coach-Karte zeigt "nicht trainiert"', () => {
    const plan = [{ id: 'mon', type: 'gym', name: 'Nur Brust', sub: '', ex: [{ n: 'Bankdrücken (LH)', s: '3×5-8' }] }];
    const ctx = loadApp({ plan, history: [] }, { now: '2026-10-19T08:00:00Z' });
    const advice = ctx.volumeProgressionAdvice();
    assert.ok(advice.find((a) => a.m === 'brust' && /nicht trainiert/.test(a.msg)));
    assert.equal(advice.find((a) => a.m === 'quads'), undefined);
    const ctx2 = loadApp(loadFixture('skipped-legs'));
    ctx2.renderCoachCard();
    assert.match(ctx2.document.getElementById('coachCard').innerHTML, /quads<\/span><span[^>]*>0 Sätze · nicht trainiert/);
  });

  test('3.2 Volumen-Ampel: Ø der letzten 14 Tage pro Woche statt rollierend 7 Tage', () => {
    const legs = (date) => ({ ts: Date.parse(`${date}T17:00:00Z`), dayName: 'Legs A', durationMs: 3e6, volume: 0,
      sets: Array.from({ length: 10 }, () => ({ ex: 'Beinstrecker', w: 45, r: 12, rpe: 8 })) });
    // Bestandsnutzer: Vorwoche 10 Sätze quads, diese Woche ausgefallen
    const ctx = loadApp({ history: [legs('2026-09-01'), legs('2026-10-09')] }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(ctx.weeklyMuscleSets().quads || 0, 0, 'rollierend 7 Tage: alles weg');
    assert.equal(ctx.smoothedWeeklyMuscleSets().quads, 5);
    ctx.renderCoachCard();
    assert.match(ctx.document.getElementById('coachCard').innerHTML, /quads<\/span><span[^>]*>5 Sätze/);
    assert.match(ctx.document.getElementById('coachCard').innerHTML, /Ø pro Woche der letzten 14 Tage/);
    // neuer Nutzer (erste Session vor 3 Tagen) → nicht halbiert
    const neu = loadApp({ history: [legs('2026-10-16')] }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(neu.smoothedWeeklyMuscleSets().quads, 10);
    // 2 Wochen mit zusammen 20 Sätzen → 10/Woche
    const zwei = loadApp({ history: [legs('2026-09-01'), legs('2026-10-09'), legs('2026-10-16')] }, { now: '2026-10-19T08:00:00Z' });
    assert.equal(zwei.smoothedWeeklyMuscleSets().quads, 10);
  });

  test('3.3 skipped-legs: Adherence-Karte "Legs A fällt oft aus"', () => {
    const ctx = loadApp(loadFixture('skipped-legs'));
    ctx.renderSmartNotifs();
    const html = ctx.document.getElementById('smartNotifs').innerHTML;
    assert.match(html, /Legs A[^<]*fällt oft aus/);
    assert.match(html, /moveMissedDay\(3\)[^>]*>Wochentag verschieben/);
    // nur Legs A – Push/Pull/Upper wurden trotz Namenszusätzen erkannt
    const missed = ctx.oftenMissedDays().map((a) => a.name);
    assert.deepEqual(JSON.parse(JSON.stringify(missed)), ['Legs A']);
    assert.equal(ctx.baseDayName('Upper B (2. Frequenz) (KI-optimiert)'), 'Upper B (2. Frequenz)');
  });

  test('3.3 Optionale Tage zählen nicht; 1 von 3 Wochen fehlt → keine Karte; zu kurze Historie → keine Karte', () => {
    const fx = loadFixture('skipped-legs');
    const opt = loadApp(fx);
    opt.AppState.plan.find((d) => d.name === 'Legs A').optional = true;
    assert.equal(opt.oftenMissedDays().length, 0);
    // Legs A nur in der letzten Woche ausgefallen
    const legs = (d) => ({ ts: Date.parse(`${d}T17:00:00Z`), dayName: 'Legs A', durationMs: 3e6, volume: 0, sets: [{ ex: 'Beinstrecker', w: 45, r: 12, rpe: 8 }] });
    const einmal = loadApp({ ...fx, state: { ...fx.state, history: [...fx.state.history, legs('2026-10-01'), legs('2026-10-08')] } });
    assert.equal(einmal.oftenMissedDays().length, 0);
    const kurz = loadApp({ ...fx, state: { ...fx.state, history: fx.state.history.slice(-3) } });
    assert.equal(kurz.oftenMissedDays().length, 0);
  });

  todo('3.4 VOLUME_LM.hams.mev = 4 und MUSCLE_MAP erkennt Copenhagen/adduct', () => {
    const ctx = loadApp({});
    assert.equal(ctx.VOLUME_LM.hams.mev, 4);
    for (const n of ['Copenhagen Adduction', 'Cable Adduction']) {
      assert.ok(ctx.musclesFor(n).some((e) => e.m === 'adduktoren'), `${n} zählt nicht für adduktoren`);
    }
  });

  todo('3.5 Plan-Untertitel nennen die tatsächliche Satzzahl', () => {
    const ctx = loadApp({});
    for (const day of ctx.defaultPlan().filter((d) => d.type === 'gym')) {
      const total = day.ex.reduce((a, e) => a + (parseInt(String(e.s), 10) || 0), 0);
      assert.match(day.sub, new RegExp(`\\b${total} Sätze`), `${day.name}: "${day.sub}" statt ${total} Sätze`);
    }
  });
}
