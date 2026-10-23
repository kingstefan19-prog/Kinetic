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

  // ── 2 Empfehlung für heute ──
  test('2 Normale Woche: geplanter Tag hat Vorrang, Fußballtag ohne Gym, Do optionaler Tag', () => {
    const mo = app([], `${DATE.mo}T08:00:00Z`).recommendedDay();
    assert.equal(mo.kind, 'train');
    assert.equal(mo.label, 'Upper A');
    assert.equal(mo.moved, false);
    const di = app([sess(DATE.mo, 'Upper A')], `${DATE.di}T08:00:00Z`).recommendedDay();
    assert.equal(di.kind, 'rest', 'Upper B am Folgetag nach Upper A nur, wenn es sonst entfiele');
    assert.match(di.label, /Fußball Training/);
    assert.equal(di.next.it.name, 'Lower');
    assert.equal(di.next.variant, 'full', 'Mi Lower voll: Mi und Do kein Fußball');
    const don = app([sess(DATE.mo, 'Upper A'), sess(DATE.mi, 'Lower')], `${DATE.do}T08:00:00Z`).recommendedDay();
    assert.equal(don.kind, 'optional');
    assert.equal(don.label, 'Arme + Schulter + Core');
    const sa = app([sess(DATE.mo, 'Upper A'), sess(DATE.mi, 'Lower')], `${DATE.sa}T08:00:00Z`).recommendedDay();
    assert.equal(sa.label, 'Upper B');
    assert.equal(sa.rirBonus, 0);
  });

  test('2 Montag (Upper A) verpasst, Dienstag (Fußball): Empfehlung Upper A mit 3-h-Hinweis', () => {
    const r = app([], `${DATE.di}T08:00:00Z`).recommendedDay();
    assert.equal(r.kind, 'train');
    assert.equal(r.label, 'Upper A');
    assert.equal(r.moved, true);
    assert.ok(r.hints.includes('Mit mindestens 3 h Abstand zum Fußball, idealerweise danach.'));
    assert.ok(r.hints.includes('Verschoben von Montag.'));
  });

  test('2 Upper A am Freitag nachgeholt, Upper B Samstag: erlaubt, weil sonst entfallend, targetRIR +1', () => {
    const ctx = app([sess(DATE.mi, 'Lower'), sess(DATE.fr, 'Upper A')], `${DATE.sa}T08:00:00Z`);
    const r = ctx.recommendedDay();
    assert.equal(r.label, 'Upper B');
    assert.equal(r.rirBonus, 1);
    assert.ok(r.hints.includes('Gestern Oberkörper: heute RIR +1'));
    const ex = 'Schrägbank Bankdrücken (LH)';
    assert.equal(ctx.targetRIR(ex), 2);
    ctx.startRecommended();
    const s = ctx.AppState.activeSession;
    assert.equal(s.dayName, 'Upper B');
    assert.equal(s.rirBonus, 1);
    assert.equal(ctx.targetRIR(ex), 3, 'in dieser Session RIR +1');
    ctx.renderWorkout();
    assert.match(html(ctx, 'workoutContent'), /Gestern Oberkörper: heute RIR \+1/);
  });

  test('2 Spieltag: Oberkörper heute erlaubt (mit Hinweis), aber nie vorausgeplant', () => {
    const so = app([sess(DATE.mo, 'Upper A'), sess(DATE.mi, 'Lower')], `${DATE.so}T08:00:00Z`).recommendedDay();
    assert.equal(so.label, 'Upper B');
    assert.ok(so.hints.includes('Mit mindestens 3 h Abstand zum Fußball, idealerweise danach.'));
    const sa = app([sess(DATE.mo, 'Upper A'), sess(DATE.mi, 'Lower'), sess(DATE.sa, 'Upper B')], `${DATE.sa}T19:00:00Z`).recommendedDay();
    assert.equal(sa.kind, 'done');
  });

  test('2 Dashboard-Karte "Heute" mit Start; AMRAP-Vorschlag nutzt die Empfehlung', () => {
    const ctx = app([], `${DATE.di}T08:00:00Z`);
    ctx.renderTodayCard();
    const t = text(ctx, 'todayCard');
    assert.match(t, /Heute: Upper A/);
    assert.match(t, /Diese Woche: Upper A · Lower · Upper B/);
    assert.match(html(ctx, 'todayCard'), /onclick="startRecommended\(\)"/);
    const g = ctx.upcomingGymDay();
    assert.equal(g.today, true);
    assert.equal(g.day.name, 'Upper A');
  });
}
