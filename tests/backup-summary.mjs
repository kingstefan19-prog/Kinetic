// Zusammenfassung eines echten Backups für `node tests/run.mjs --backup <pfad>`
// (docs/UPGRADE-SPEC.md, Phase 0.5). Liest nur – speichert nichts.

import path from 'node:path';
import { loadApp, REPO_ROOT } from './harness.mjs';

const DAY = 24 * 60 * 60 * 1000;
const FOUR_H = 4 * 60 * 60 * 1000;

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const fmtDate = (ts) => new Date(ts).toISOString().slice(0, 10);

// Kriterien aus Spec 1.4: w > 2× Median der Übung, RPE außerhalb 5–10,
// Session-Dauer > 4 h. Sätze ohne RPE (null/leer) gelten nicht als Fund.
export function findOutliers(history) {
  const weights = new Map();
  for (const s of history) for (const set of s.sets || []) {
    const w = +set.w;
    if (w > 0) { if (!weights.has(set.ex)) weights.set(set.ex, []); weights.get(set.ex).push(w); }
  }
  const med = new Map([...weights].map(([ex, ws]) => [ex, median(ws)]));
  const found = [];
  history.forEach((s, si) => {
    (s.sets || []).forEach((set, i) => {
      const w = +set.w;
      if (w > 0 && w > 2 * med.get(set.ex)) {
        found.push({ kind: 'gewicht', session: si, set: i, date: fmtDate(s.ts), ex: set.ex, detail: `${w} kg (Median ${med.get(set.ex)} kg)` });
      }
      const rpe = set.rpe;
      if (rpe !== null && rpe !== undefined && rpe !== '' && (+rpe < 5 || +rpe > 10)) {
        found.push({ kind: 'rpe', session: si, set: i, date: fmtDate(s.ts), ex: set.ex, detail: `RPE ${rpe}` });
      }
    });
    if (+s.durationMs > FOUR_H) {
      found.push({ kind: 'dauer', session: si, date: fmtDate(s.ts), ex: s.dayName, detail: `${Math.round(s.durationMs / 60000)} Min` });
    }
  });
  return found;
}

export function summarizeBackup(backup, file) {
  const out = [];
  const say = (s = '') => out.push(s);
  const state = backup && backup.state ? backup.state : backup;
  const history = (state && state.history) || [];
  const now = backup.ts || (history.length ? history[history.length - 1].ts : Date.now());

  const rel = path.relative(REPO_ROOT, path.resolve(file));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    say('⚠  Das Backup liegt IM Repo. Bitte außerhalb ablegen (CLAUDE.md) – niemals committen.');
    say();
  }

  say(`Backup:     ${path.basename(file)} · Version ${backup.version || '?'} · Export ${fmtDate(now)}`);
  if (!history.length) { say('Keine Sessions im Backup.'); return out.join('\n'); }

  const first = history[0].ts, last = history[history.length - 1].ts;
  const weeks = Math.max(1, (last - first) / (7 * DAY));
  const allSets = history.flatMap((s) => s.sets || []);
  say(`Sessions:   ${history.length} (${fmtDate(first)} bis ${fmtDate(last)}) · Ø ${(history.length / weeks).toFixed(1)} pro Woche`);
  say(`Sätze:      ${allSets.length} · ${new Set(allSets.map((s) => s.ex)).size} verschiedene Übungen`);
  say(`Weitere:    weightLog ${(state.weightLog || []).length} · sleepLog ${(state.sleepLog || []).length} · wearableLog ${(state.wearableLog || []).length}`);

  // Ausreißer
  const outliers = findOutliers(history);
  say();
  say(`Ausreißer (Kriterien Spec 1.4): ${outliers.length}`);
  const label = { gewicht: 'Gewicht > 2× Median', rpe: 'RPE außerhalb 5–10', dauer: 'Session > 4 h' };
  for (const kind of ['gewicht', 'rpe', 'dauer']) {
    const list = outliers.filter((o) => o.kind === kind);
    say(`  ${label[kind]}: ${list.length}`);
    for (const o of list) say(`    ${o.date}  ${o.ex} – ${o.detail}`);
  }

  // Volumen pro Muskel – über die App-Logik selbst (MUSCLE_MAP-Gewichtung)
  const ctx = loadApp(backup, { now });
  const last7 = ctx.weeklyMuscleSets();
  const since28 = now - 28 * DAY;
  const acc28 = {};
  for (const s of history) {
    if (s.ts < since28 || s.ts > now) continue;
    for (const set of s.sets || []) {
      if (!set.r && !set.secs) continue;
      for (const e of ctx.musclesFor(set.ex || '')) acc28[e.m] = (acc28[e.m] || 0) + (e.w || 1);
    }
  }
  say();
  say('Volumen pro Muskel (gewichtete Sätze; Ziel MEV–MAV)');
  say('  Muskel        7 Tage   Ø/Woche (28 T)   MEV/MAV/MRV');
  for (const [m, lm] of Object.entries(ctx.VOLUME_LM)) {
    const v7 = last7[m] || 0;
    const v28 = (acc28[m] || 0) / 4;
    const flag = v28 < lm.mev ? '  ↓ unter MEV' : v28 > lm.mrv ? '  ↑ über MRV' : '';
    say(`  ${m.padEnd(12)} ${String(v7).padStart(6)}   ${v28.toFixed(1).padStart(14)}   ${lm.mev}/${lm.mav}/${lm.mrv}${flag}`);
  }
  say();
  say('Keine Daten gespeichert.');
  return out.join('\n');
}
