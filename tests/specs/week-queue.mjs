// feat/week-queue – verpasste Trainings innerhalb der Woche nachholen
export const title = 'Wochen-Warteschlange';

const plain = (x) => JSON.parse(JSON.stringify(x));
const html = (ctx, id) => ctx.document.getElementById(id).innerHTML;
const text = (ctx, id) => html(ctx, id).replace(/<[^>]+>/g, '');

// Woche Mo 19.10. – So 25.10.2026 (3+1-Plan: Mo Upper A, Di ⚽, Mi Lower, Do optional, Fr ⚽, Sa Upper B, So Spiel)
const DATE = { mo: '2026-10-19', di: '2026-10-20', mi: '2026-10-21', do: '2026-10-22', fr: '2026-10-23', sa: '2026-10-24', so: '2026-10-25' };

export default function ({ test, assert, loadApp }) {
  const PLAN = plain(loadApp({}).plan3plus1());
  const dayEx = (name) => PLAN.find((d) => d.name === name).ex;
  // Session aus den Übungen eines Plantags (je 2 Sätze), optional als Variante
  const sess = (date, name, opts = {}) => {
    const ex = opts.ex || dayEx(name);
    return { ts: Date.parse(`${date}T${opts.time || '17:00'}:00Z`), dayName: name + (opts.suffix || ''), durationMs: 3e6, volume: 0,
      sets: ex.filter((e) => !e.timed).flatMap((e) => [{ ex: e.n, w: 50, r: 8, rpe: 8 }, { ex: e.n, w: 50, r: 8, rpe: 8 }]) };
  };
  const app = (history, now, extra = {}) => loadApp({ plan: plain(PLAN), history, ...extra }, { now });
  const KOMPAKT = [{ n: 'Kniebeuge (LH)', s: '3×5' }, { n: 'Beinpresse', s: '2×10' }, { n: 'Wadenheben stehend', s: '3×10-15' }];

  // ── 1 Wochen-Warteschlange ──
  test('1 weekQueue(): Pflicht-Gymtage der Woche, erledigt per baseDayName, optionale Tage zählen nicht', () => {
    const ctx = app([sess(DATE.mo, 'Upper A', { suffix: ' (optimiert)' })], `${DATE.mi}T08:00:00Z`);
    const q = ctx.weekQueue();
    assert.deepEqual(plain(q.items.map((x) => x.name)), ['Upper A', 'Lower', 'Upper B']);
    assert.deepEqual(plain(q.done.map((x) => x.name)), ['Upper A']);
    assert.deepEqual(plain(q.open.map((x) => x.name)), ['Lower', 'Upper B']);
    assert.equal(q.items.find((x) => x.name === 'Lower').isLeg, true);
    assert.equal(q.items.find((x) => x.name === 'Upper A').isLeg, false);
    // Sessions der Vorwoche zählen nicht
    const neu = app([sess('2026-10-14', 'Lower')], `${DATE.mo}T08:00:00Z`);
    assert.equal(neu.weekQueue().open.length, 3);
  });

  test('1 Lower kompakt zählt in weekQueue() als erledigtes Lower', () => {
    const ctx = app([sess(DATE.do, 'Lower', { suffix: ' (kompakt)', ex: KOMPAKT })], `${DATE.fr}T08:00:00Z`);
    assert.equal(ctx.baseDayName('Lower (kompakt)'), 'Lower');
    const lower = ctx.weekQueue().items.find((x) => x.name === 'Lower');
    assert.equal(lower.done, true);
    assert.equal(lower.compact, true);
    assert.equal(lower.doneIdx, 3, 'am Donnerstag erledigt');
  });
}
