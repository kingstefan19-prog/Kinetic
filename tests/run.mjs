#!/usr/bin/env node
// KINETIC Test-Runner (docs/UPGRADE-SPEC.md, Phase 0.5)
//
//   node tests/run.mjs                    alle Tests, PASS/FAIL je Test
//   node tests/run.mjs --todo             zusätzlich TODO-Prüfungen ausführen
//                                         (zeigt, welche Akzeptanzkriterien
//                                         späterer Phasen schon erfüllt sind)
//   node tests/run.mjs --backup <pfad>    plus Zusammenfassung eines echten
//                                         Backups (außerhalb des Repos!)
//   node tests/run.mjs --verbose          App-Logs mit ausgeben
//
// Exit-Code 1, sobald ein Test fehlschlägt. TODOs ändern den Exit-Code nie.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as harness from './harness.mjs';
import { summarizeBackup } from './backup-summary.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = path.join(HERE, 'specs');

// ── Argumente ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { todo: false, verbose: false, backup: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--todo') opts.todo = true;
  else if (a === '--verbose') opts.verbose = true;
  else if (a === '--backup') {
    opts.backup = argv[++i];
    if (!opts.backup) { console.error('--backup braucht einen Pfad'); process.exit(1); }
  } else if (a === '--help' || a === '-h') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  } else { console.error(`Unbekannte Option: ${a} (siehe --help)`); process.exit(1); }
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const PASS = c('32', 'PASS'), FAIL = c('31', 'FAIL'), TODO = c('33', 'TODO');

// ── Tests sammeln ────────────────────────────────────────────────────────
const groups = [];
const specFiles = fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.mjs')).sort();
const loadErrors = [];
for (const file of specFiles) {
  const group = { file, title: file, entries: [] };
  try {
    const mod = await import(pathToFileURL(path.join(SPEC_DIR, file)).href);
    group.title = mod.title || file;
    const api = {
      test: (name, fn) => group.entries.push({ kind: 'test', name, fn }),
      todo: (name, fn) => group.entries.push({ kind: 'todo', name, fn }),
      assert,
      loadApp: (input, o = {}) => harness.loadApp(input, Object.assign({ verbose: opts.verbose }, o)),
      loadFixture: harness.loadFixture,
      fixtureNames: harness.fixtureNames,
      syntaxCheck: harness.syntaxCheck,
      appSource: harness.appSource,
      runInApp: harness.runInApp,
      REPO_ROOT: harness.REPO_ROOT,
    };
    mod.default(api);
  } catch (e) {
    loadErrors.push({ file, error: e });
  }
  groups.push(group);
}

// ── Ausführen ────────────────────────────────────────────────────────────
const firstLine = (e) => String((e && e.message) || e).split('\n')[0];
let pass = 0, fail = 0, todo = 0, todoPassing = 0;

console.log(c('1', 'KINETIC Tests') + c('2', `  ·  index.html  ·  Node ${process.version}`));
for (const g of groups) {
  console.log('\n' + c('1', `── ${g.title}`));
  const err = loadErrors.find((e) => e.file === g.file);
  if (err) { fail++; console.log(`  ${FAIL}  Testdatei lädt nicht: ${firstLine(err.error)}`); continue; }
  for (const e of g.entries) {
    if (e.kind === 'todo') {
      todo++;
      if (opts.todo && e.fn) {
        try { await e.fn(); todoPassing++; console.log(`  ${TODO}  ${e.name}  ${c('32', '[würde: PASS]')}`); }
        catch (x) { console.log(`  ${TODO}  ${e.name}  ${c('2', '[würde: FAIL – ' + firstLine(x) + ']')}`); }
      } else {
        console.log(`  ${TODO}  ${e.name}${e.fn ? '' : c('2', '  (noch keine Prüfung)')}`);
      }
      continue;
    }
    try { await e.fn(); pass++; console.log(`  ${PASS}  ${e.name}`); }
    catch (x) {
      fail++;
      console.log(`  ${FAIL}  ${e.name}`);
      console.log(c('31', `        → ${firstLine(x)}`));
      if (opts.verbose && x && x.stack) console.log(c('2', x.stack.split('\n').slice(1, 6).join('\n')));
    }
  }
}

console.log('\n' + c('1', `Ergebnis: ${pass} PASS · ${fail} FAIL · ${todo} TODO`) +
  (opts.todo ? c('2', `  (davon ${todoPassing} TODO-Prüfungen bereits erfüllt)`) : ''));

// ── Optional: echtes Backup zusammenfassen ───────────────────────────────
if (opts.backup) {
  console.log('\n' + c('1', '── Backup-Zusammenfassung (nur Lesen, nichts wird gespeichert)'));
  try {
    const file = path.resolve(opts.backup);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(summarizeBackup(data, file));
  } catch (e) {
    fail++;
    console.log(`  ${FAIL}  Backup konnte nicht gelesen werden: ${firstLine(e)}`);
  }
}

process.exit(fail ? 1 : 0);
