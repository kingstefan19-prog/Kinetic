// Phase 0: Sicherheit und Testgerüst – echte Tests (müssen grün sein)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const title = 'Phase 0 · Sicherheit und Testgerüst';

const PFLICHT_FIXTURES = ['bodyweight-plateau', 'bench-oscillation', 'outliers', 'skipped-legs', 'post-layoff'];

// Einstiegspunkte aus CLAUDE.md
const FUNKTIONEN = ['coachSuggestion', 'layoffStatus', 'liftTrend', 'stalledLifts', 'needsDeload', 'recentRpeTrend',
  'e1rm', 'recomputePRs', 'loadIncrement', 'plateStep', 'justIncreasedWeight', 'equipmentType', 'musclesFor',
  'weeklyMuscleSets', 'volumeProgressionAdvice', 'startWorkout', 'renderWorkout', 'finishWorkout', 'renderLog',
  'defaultPlan', 'generatePlan', 'applyBackupState', 'logWeight', 'logWearable'];
const OBJEKTE = ['MUSCLE_MAP', 'VOLUME_LM', 'AppState'];

export default function ({ test, assert, loadApp, loadFixture, fixtureNames, syntaxCheck, REPO_ROOT }) {

  // ── 0.2 ──
  test('0.2 .gitignore enthält kinetic-backup-*.json, *.backup.json, /local/', () => {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
    for (const p of ['kinetic-backup-*.json', '*.backup.json', '/local/']) assert.ok(gi.includes(p), `fehlt: ${p}`);
  });

  test('0.2 Keine Backup-Datei ist im Repo eingecheckt', () => {
    let tracked;
    try { tracked = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n'); }
    catch { return; }   // kein git verfügbar → Prüfung entfällt
    const bad = tracked.filter((f) => /(^|\/)kinetic-backup-.*\.json$|\.backup\.json$|^local\//.test(f));
    assert.deepEqual(bad, [], `eingecheckt: ${bad.join(', ')}`);
  });

  // ── 0.3 ──
  test('0.3 Inline-JS von index.html ist syntaktisch gültig (wie node --check)', () => {
    assert.equal(syntaxCheck(), true);
  });

  test('0.3 App lädt im Harness ohne Laufzeitfehler, initApp wird abgefangen', () => {
    const ctx = loadApp({});
    const types = ctx.__harness.listeners.map((l) => `${l.target}:${l.type}`);
    assert.ok(types.includes('document:DOMContentLoaded'), 'initApp wurde nicht auf DOMContentLoaded angemeldet');
    assert.equal(ctx.document.getElementById('heroStats').innerHTML, '', 'initApp ist gelaufen (Hero gerendert)');
    const errors = ctx.__harness.logs.filter((l) => l.level === 'error');
    assert.equal(errors.length, 0, `App-Fehler beim Laden: ${errors.map((e) => e.args.join(' ')).join(' | ')}`);
  });

  test('0.3 Einstiegspunkte aus CLAUDE.md sind über den Kontext erreichbar', () => {
    const ctx = loadApp({});
    const fehlend = FUNKTIONEN.filter((n) => typeof ctx[n] !== 'function');
    assert.deepEqual(fehlend, [], `keine Funktion: ${fehlend.join(', ')}`);
    for (const n of OBJEKTE) assert.equal(typeof ctx[n], 'object', `${n} nicht erreichbar`);
    assert.ok(ctx.VOLUME_LM.hams && ctx.MUSCLE_MAP.length > 0);
  });

  test('0.3 loadApp befüllt AppState über den echten Ladeweg (AppState.load)', () => {
    const fx = loadFixture('bench-oscillation');
    const ctx = loadApp(fx);
    assert.equal(ctx.AppState.history.length, fx.state.history.length);
    assert.equal(ctx.AppState.user.name, 'Testathlet');
    assert.ok(ctx.AppState.prs['Bankdrücken (LH)'] > 110, 'PRs wurden nicht aus der History berechnet');
    assert.equal(ctx.AppState.plan.length, 7, 'ohne Plan im State muss der Standardplan geladen werden');
    // mitgelieferter Plan bleibt erhalten
    const eigenerPlan = [{ id: 'mon', type: 'gym', name: 'Testtag', sub: 'x', ex: [{ n: 'Bankdrücken (LH)', s: '3×5-8' }] }];
    const ctx2 = loadApp({ plan: eigenerPlan });
    assert.equal(ctx2.AppState.plan[0].name, 'Testtag');
  });

  test('0.3 Uhr ist über _fixture.now / opts.now fixierbar', () => {
    const ctx = loadApp(loadFixture('post-layoff'));
    assert.equal(ctx.Date.now(), Date.parse('2026-10-10T08:00:00Z'));
    assert.equal(new ctx.Date().getTime(), Date.parse('2026-10-10T08:00:00Z'));
    assert.equal(ctx.localDateStr(), '2026-10-10');
    ctx.__harness.setNow('2026-12-24T12:00:00Z');
    assert.equal(ctx.localDateStr(), '2026-12-24');
    const frei = loadApp({}, { now: null });
    assert.ok(Math.abs(frei.Date.now() - Date.now()) < 5000, 'ohne now soll die echte Zeit laufen');
  });

  test('0.3 Jeder loadApp-Aufruf ist isoliert (State und Storage)', () => {
    const a = loadApp(loadFixture('bench-oscillation'));
    const b = loadApp({});
    a.AppState.history.push({ ts: 1, sets: [] });
    a.localStorage.setItem('kinetic.marker', '1');
    assert.equal(b.AppState.history.length, 0);
    assert.equal(b.localStorage.getItem('kinetic.marker'), null);
  });

  test('0.3 Timer sind No-op (Callbacks laufen nie)', () => {
    const ctx = loadApp({});
    let lief = false;
    ctx.Timers.set(() => { lief = true; }, 0, 'harness-test');
    assert.equal(lief, false);
    assert.ok(ctx.__harness.timersScheduled >= 1);
  });

  // ── 0.4 ──
  test('0.4 Alle Pflicht-Fixtures sind vorhanden', () => {
    const da = fixtureNames();
    const fehlend = PFLICHT_FIXTURES.filter((n) => !da.includes(n));
    assert.deepEqual(fehlend, [], `fehlt: ${fehlend.join(', ')}`);
  });

  test('0.4 Fixtures sind synthetisch und als Backup (version 2) importierbar', () => {
    for (const name of fixtureNames()) {
      const fx = loadFixture(name);
      assert.equal(fx.version, 2, `${name}: version`);
      assert.equal(fx._fixture && fx._fixture.synthetic, true, `${name}: nicht als synthetisch markiert`);
      assert.equal(fx.state.user.name, 'Testathlet', `${name}: Profilname muss synthetisch sein`);
      assert.ok(Array.isArray(fx.state.history) && fx.state.history.length > 0, `${name}: History leer`);
      // Import über den echten Backup-Pfad der App
      const ctx = loadApp({});
      ctx.applyBackupState(fx.state);
      assert.equal(ctx.AppState.history.length, fx.state.history.length, `${name}: Import unvollständig`);
    }
  });

  test('0.4 Fixture-Inhalte entsprechen der Spec', () => {
    const DAY = 864e5;
    const bw = loadFixture('bodyweight-plateau').state.history;
    assert.equal(bw.length, 3);
    for (const s of bw) {
      const k = s.sets.filter((x) => x.ex === 'Klimmzüge');
      assert.deepEqual(k.map((x) => [x.w, x.r]), [[105, 10], [105, 10], [105, 10], [105, 10]]);
    }

    const bench = loadFixture('bench-oscillation').state.history;
    const last = bench[bench.length - 1].sets.filter((x) => x.ex === 'Bankdrücken (LH)');
    assert.deepEqual(last.map((x) => x.r), [8, 8, 6, 5]);
    assert.ok(last.every((x) => x.w === 110 && x.rpe === 8));

    const out = loadFixture('outliers').state.history;
    const sc = out.flatMap((s) => s.sets).filter((x) => x.ex === 'Skull Crushers (LH)').map((x) => `${x.w}×${x.r}`);
    assert.deepEqual(sc, ['18×8', '25×10', '125×12']);
    assert.equal(out.flatMap((s) => s.sets).filter((x) => x.rpe === 78).length, 1);
    assert.equal(out.filter((s) => s.durationMs === 48 * 3600e3).length, 1);

    const legs = loadFixture('skipped-legs');
    const h = legs.state.history;
    const now = Date.parse(legs._fixture.now);
    // 3 Wochen = jeder Trainingstag genau 3× im 21-Tage-Fenster aus Spec 3.3
    const imFenster = h.filter((s) => now - s.ts <= 21 * DAY);
    assert.equal(imFenster.length, h.length, 'alle Sessions müssen in den letzten 21 Tagen liegen');
    for (const tag of ['Push A', 'Pull A', 'Upper B']) {
      const n = h.filter((s) => s.dayName.startsWith(tag)).length;
      assert.equal(n, 3, `${tag}: ${n}× statt 3× in 3 Wochen`);
    }
    const beinUebungen = h.flatMap((s) => s.sets).filter((x) => /kniebeug|beinpresse|beinstreck|beinbeug|rumän|waden|adduk|abduk/i.test(x.ex));
    assert.equal(beinUebungen.length, 0, 'skipped-legs enthält Bein-Übungen');

    const pl = loadFixture('post-layoff').state.history;
    const sb = pl.map((s) => s.sets.filter((x) => x.ex === 'Schrägbankdrücken (KH)'));
    assert.ok(sb[0].every((x) => x.w === 42 && x.r === 9) && sb[1].every((x) => x.w === 42 && x.r === 9));
    assert.equal(Math.round((pl[2].ts - pl[1].ts) / DAY), 25);
    assert.ok(sb[2].every((x) => x.w === 34 && x.r === 10));
    const avgRpe = sb[2].reduce((a, x) => a + x.rpe, 0) / sb[2].length;
    assert.ok(Math.abs(avgRpe - 6.7) < 0.05, `Ø RPE ${avgRpe}`);
  });

  // ── Smoke: Kernlogik läuft auf allen Fixtures ohne Exception ──
  test('Smoke: Coach, Volumen, Readiness und Deload laufen auf allen Fixtures', () => {
    for (const name of fixtureNames()) {
      const ctx = loadApp(loadFixture(name));
      const exNames = new Set(ctx.AppState.history.flatMap((s) => s.sets.map((x) => x.ex)));
      for (const ex of exNames) {
        const r = ctx.coachSuggestion(ex, '3×8-12');
        assert.ok(r && typeof r.hint === 'string', `${name}/${ex}: keine Empfehlung`);
      }
      ctx.volumeProgressionAdvice();
      ctx.weeklyMuscleSets();
      assert.equal(typeof ctx.readinessScore().score, 'number');
      ctx.needsDeload();
    }
  });
}
