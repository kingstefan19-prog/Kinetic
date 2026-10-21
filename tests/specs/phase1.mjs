// Phase 1: Datenqualität – Akzeptanzkriterien (TODO bis zur Umsetzung)
export const title = 'Phase 1 · Datenqualität';

export default function ({ todo, assert, loadApp, loadFixture }) {
  todo('1.1 Plausibilitätsprüfung beim Abhaken (Gewicht ±50 %, RPE 5–10 in 0,5-Schritten, Wdh 1–50)');
  todo('1.2 Session-Dauer über lastSetTs, Karte für offene Session > 3 h, > 4 h aus Zeit-Kennzahlen');
  todo('1.3 Log: Satz bearbeiten/löschen, Session löschen, PRs neu berechnen, "Mehr laden"');
  todo('1.4 Bereinigungs-Assistent: outliers.json liefert genau 3 Funde');

  todo('1.4 Nach Löschen des 125-kg-Satzes liegt der PR für Skull Crushers (LH) unter 60', () => {
    const ctx = loadApp(loadFixture('outliers'));
    assert.ok(ctx.AppState.prs['Skull Crushers (LH)'] >= 60, 'Ausgangslage: Tippfehler treibt den PR hoch');
    for (const s of ctx.AppState.history) {
      s.sets = s.sets.filter((x) => !(x.ex === 'Skull Crushers (LH)' && x.w === 125));
    }
    ctx.AppState.prs = ctx.recomputePRs(ctx.AppState.history);
    assert.ok(ctx.AppState.prs['Skull Crushers (LH)'] < 60, `PR ${ctx.AppState.prs['Skull Crushers (LH)']}`);
  });
}
