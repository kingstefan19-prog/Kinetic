// Phase 3: Volumen und Adherence – Akzeptanzkriterien (TODO bis zur Umsetzung)
export const title = 'Phase 3 · Volumen und Adherence';

export default function ({ todo, assert, loadApp, loadFixture }) {
  todo('3.1 skipped-legs: "nicht trainiert"-Warnungen für quads, hams und wade', () => {
    const advice = loadApp(loadFixture('skipped-legs')).volumeProgressionAdvice();
    for (const m of ['quads', 'hams', 'wade']) {
      const a = advice.find((x) => x.m === m);
      assert.ok(a, `keine Warnung für ${m}`);
      assert.match(a.msg, /nicht trainiert/);
    }
  });

  todo('3.2 Volumen-Ampel: Ø der letzten 14 Tage pro Woche statt rollierend 7 Tage');

  todo('3.3 skipped-legs: Adherence-Karte "Legs A fällt oft aus"', () => {
    const ctx = loadApp(loadFixture('skipped-legs'));
    ctx.renderSmartNotifs();
    assert.match(ctx.document.getElementById('smartNotifs').innerHTML, /Legs A[^<]*fällt oft aus/);
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
