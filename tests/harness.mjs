// KINETIC Test-Harness (docs/UPGRADE-SPEC.md, Phase 0.3)
//
// Lädt index.html, extrahiert alle Inline-<script>-Blöcke und führt sie in
// node:vm aus – mit minimalen Browser-Mocks. index.html wird dafür NICHT
// verändert: Der Init-Code wird abgefangen, weil der Mock
// document.readyState === 'loading' meldet und DOMContentLoaded nie feuert.
//
// Einstieg:
//   import { loadApp, loadFixture } from './harness.mjs';
//   const ctx = loadApp(loadFixture('bench-oscillation'));
//   ctx.coachSuggestion('Bankdrücken (LH)', '4×5-8');

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');
export const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
export const FIXTURE_DIR = path.join(HERE, 'fixtures');

const DB_PREFIX = 'kinetic.';

// ── Skripte extrahieren ──────────────────────────────────────────────────
// Liefert [{code, line}] für jedes Inline-Skript. `line` ist die Zeile in
// index.html, in der das Skript beginnt – damit zeigen Stacktraces echte
// index.html-Zeilennummern.
export function extractScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/javascript|ecmascript/i.test(type)) continue;   // z. B. ld+json
    const openTagEnd = m.index + m[0].indexOf('>') + 1;
    const line = html.slice(0, openTagEnd).split('\n').length;
    out.push({ code: m[2], line });
  }
  return out;
}

// Namen der obersten const/let-Deklarationen. Diese landen in vm NICHT als
// Property auf dem Kontext (anders als var/function) und werden deshalb per
// Getter durchgereicht, damit ctx.AppState, ctx.VOLUME_LM usw. funktionieren.
function topLevelLexicalNames(code) {
  const names = new Map();   // name → 'const' | 'let'
  const re = /^(const|let)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) names.set(m[2], m[1]);
  return names;
}

// Kompilat wird zwischengespeichert: ein vm.Script läuft in beliebig vielen
// Kontexten, jeder Test bekommt trotzdem einen frischen Kontext.
let compiled = null;
function compileApp() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  if (compiled && compiled.html === html) return compiled;
  const scripts = extractScripts(html);
  if (!scripts.length) throw new Error('index.html enthält kein Inline-Skript');
  const lexical = new Map();
  const units = scripts.map(({ code, line }, i) => {
    for (const [n, kind] of topLevelLexicalNames(code)) lexical.set(n, kind);
    return {
      line,
      script: new vm.Script(code, {
        filename: scripts.length > 1 ? `index.html#script${i + 1}` : 'index.html',
        lineOffset: line - 1,
      }),
    };
  });
  const bridgeSrc = [...lexical].map(([n, kind]) =>
    `Object.defineProperty(globalThis, ${JSON.stringify(n)}, {configurable:true, enumerable:false,` +
    ` get:function(){ return ${n}; }` +
    (kind === 'let' ? `, set:function(v){ ${n} = v; }` : '') + `});`
  ).join('\n');
  compiled = { html, units, lexicalNames: [...lexical.keys()], bridge: new vm.Script(bridgeSrc, { filename: 'harness-bridge.js' }) };
  return compiled;
}

// Syntax-Check (entspricht `node --check` auf das extrahierte JS)
export function syntaxCheck() {
  compiled = null;
  compileApp();
  return true;
}

// Extrahiertes App-JS als ein String (für statische Prüfungen in Tests)
export function appSource() {
  return extractScripts(fs.readFileSync(INDEX_HTML, 'utf8')).map((s) => s.code).join('\n');
}

// ── Mocks ────────────────────────────────────────────────────────────────
// Storage mit echter Semantik: gespeicherte Keys sind eigene, aufzählbare
// Properties (Object.keys(localStorage) liefert sie), Methoden am Prototyp.
const StorageProto = {
  getItem(k) { k = String(k); return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
  setItem(k, v) { this[String(k)] = String(v); },
  removeItem(k) { delete this[String(k)]; },
  clear() { for (const k of Object.keys(this)) delete this[k]; },
  key(i) { const ks = Object.keys(this); return i < ks.length ? ks[i] : null; },
};
Object.defineProperty(StorageProto, 'length', { get() { return Object.keys(this).length; } });
function makeStorage() { return Object.create(StorageProto); }

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    contains: (c) => set.has(c),
    toString: () => [...set].join(' '),
  };
}

function makeElement(tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: id || '',
    style: {}, dataset: {}, classList: makeClassList(),
    children: [], parentNode: null,
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    href: '', download: '', rel: '', src: '', type: '', onclick: null,
    scrollTop: 0, offsetHeight: 0,
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); if (c && typeof c === 'object') c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); if (c) c.parentNode = null; return c; },
    insertBefore(c) { return this.appendChild(c); },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(k, v) { this['attr:' + k] = String(v); },
    getAttribute(k) { return this['attr:' + k] === undefined ? null : this['attr:' + k]; },
    removeAttribute(k) { delete this['attr:' + k]; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    focus() {}, blur() {}, select() {}, setSelectionRange() {}, click() {},
    scrollIntoView() {}, scrollTo() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
  };
  return el;
}

// Uhr im Kontext: __harnessNow fixiert Date.now() und new Date().
// null = echte Zeit.
const CLOCK_SRC = `(function(){
  var RealDate = Date;
  function now(){ return globalThis.__harnessNow == null ? RealDate.now() : globalThis.__harnessNow; }
  class HarnessDate extends RealDate {
    constructor(...a){ if(a.length === 0) super(now()); else super(...a); }
    static now(){ return now(); }
  }
  globalThis.Date = HarnessDate;
  globalThis.window = globalThis;
  globalThis.self = globalThis;
})();`;
const clockScript = new vm.Script(CLOCK_SRC, { filename: 'harness-clock.js' });

function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) throw new Error(`Ungültige Zeitangabe für die Harness-Uhr: ${t}`);
  return ms;
}

// Erzeugt einen frischen Kontext mit allen Mocks (noch ohne App-Code)
function createSandbox({ now = null, verbose = false, confirmResult = true } = {}) {
  const elements = new Map();
  const logs = [];
  const listeners = [];
  const dialogs = [];
  let timerCount = 0;
  const html = fs.readFileSync(INDEX_HTML, 'utf8');

  const consoleMock = {};
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    consoleMock[level] = (...args) => {
      logs.push({ level, args });
      if (verbose) console[level === 'debug' ? 'log' : level]('[app]', ...args);
    };
  }

  const document = {
    readyState: 'loading',            // → initApp wird nur angemeldet, nie ausgeführt
    hidden: false,
    activeElement: null,
    body: makeElement('body', 'body'),
    head: makeElement('head', 'head'),
    documentElement: Object.assign(makeElement('html', 'html'), { outerHTML: html }),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement('div', id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeElement(tag); },
    createTextNode(t) { return { textContent: String(t) }; },
    addEventListener(type) { listeners.push({ target: 'document', type }); },
    removeEventListener() {},
    execCommand() { return false; },
  };

  const location = { href: 'http://harness.local/', protocol: 'file:', hostname: '', pathname: '/', search: '', hash: '' };
  const history = {
    replaceState(_s, _t, url) {
      const u = String(url == null ? '' : url);
      const q = u.indexOf('?');
      const h = u.indexOf('#');
      location.search = q >= 0 ? u.slice(q, h > q ? h : undefined) : '';
      location.hash = h >= 0 ? u.slice(h) : '';
      const p = u.split(/[?#]/)[0];
      if (p) location.pathname = p;
    },
    pushState(s, t, url) { this.replaceState(s, t, url); },
  };

  class BlobMock {
    constructor(parts = [], opts = {}) {
      this.parts = parts; this.type = opts.type || '';
      this.size = parts.reduce((a, p) => a + String(p).length, 0);
    }
  }
  class FileMock extends BlobMock {
    constructor(parts, name, opts) { super(parts, opts); this.name = name; }
  }
  class FileReaderMock { readAsText() {} readAsDataURL() {} }
  let blobCount = 0;

  const sandbox = {
    console: consoleMock,
    document,
    navigator: { userAgent: 'kinetic-test-harness', language: 'de-DE', standalone: false, onLine: true },
    location,
    history,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener(type) { listeners.push({ target: 'window', type }); },
    removeEventListener() {},
    // Spec 0.3: Timer als No-op – Callbacks laufen nie
    setTimeout() { return ++timerCount; },
    setInterval() { return ++timerCount; },
    clearTimeout() {}, clearInterval() {},
    // Verbotene Browser-Dialoge (CLAUDE.md) – Aufrufe werden protokolliert
    confirm(msg) { dialogs.push({ type: 'confirm', msg: String(msg) }); return confirmResult; },
    alert(msg) { dialogs.push({ type: 'alert', msg: String(msg) }); },
    prompt(msg) { dialogs.push({ type: 'prompt', msg: String(msg) }); return null; },
    Blob: BlobMock,
    File: FileMock,
    FileReader: FileReaderMock,
    URL: { createObjectURL: () => `blob:harness/${++blobCount}`, revokeObjectURL() {} },
    __harnessNow: now,
  };

  const ctx = vm.createContext(sandbox);
  clockScript.runInContext(ctx);

  const harness = {
    elements, logs, listeners, dialogs,
    get timersScheduled() { return timerCount; },
    get storage() { return sandbox.localStorage; },
    setNow(t) { ctx.__harnessNow = toMs(t); },
    now() { return ctx.__harnessNow == null ? Date.now() : ctx.__harnessNow; },
  };
  Object.defineProperty(ctx, '__harness', { value: harness, enumerable: false });
  return ctx;
}

// Backup ({version, state}) oder nackten State normalisieren
function normalizeInput(input) {
  if (!input) return { state: {}, meta: {} };
  if (input.state && typeof input.state === 'object') return { state: input.state, meta: input._fixture || {}, ts: input.ts };
  return { state: input, meta: {} };
}

// ── loadApp ──────────────────────────────────────────────────────────────
// Erzeugt einen frischen Kontext, führt index.html aus, befüllt den
// localStorage mit dem übergebenen State und ruft AppState.load() auf –
// derselbe Ladeweg wie in der echten App (inkl. Plan-Migration,
// PR-Neuberechnung, Mahlzeiten-Tagesfilter).
//
// input:  Backup-Objekt ({version, ts, state}), Fixture oder nackter State
// opts:   now          – fixe Uhr (ms oder ISO-String); Default: _fixture.now
//         db           – zusätzliche DB-Keys, z. B. {lastDeloadWeek: 2}
//         planSource   – 'default' | 'custom' (nur wenn state.plan gesetzt)
//         confirm      – Rückgabewert von confirm() (Default true)
//         verbose      – App-Logs auf die Konsole durchreichen
export function loadApp(input, opts = {}) {
  const { state, meta } = normalizeInput(input);
  const now = opts.now !== undefined ? toMs(opts.now) : toMs(meta.now);
  const { units, bridge } = compileApp();

  const ctx = createSandbox({ now, verbose: !!opts.verbose, confirmResult: opts.confirm !== undefined ? opts.confirm : true });
  for (const u of units) u.script.runInContext(ctx);
  bridge.runInContext(ctx);

  // State in den Storage schreiben (gleiche Keys wie AppState.save())
  const ls = ctx.localStorage;
  for (const [k, v] of Object.entries(state)) {
    if (v === undefined) continue;
    ls.setItem(DB_PREFIX + k, JSON.stringify(v));
  }
  // Mitgelieferter Plan soll erhalten bleiben → Version als aktuell markieren
  if (state.plan) {
    ls.setItem(DB_PREFIX + 'planVersion', JSON.stringify(ctx.PLAN_VERSION));
    ls.setItem(DB_PREFIX + 'planSource', JSON.stringify(opts.planSource || 'default'));
  }
  for (const [k, v] of Object.entries(opts.db || {})) ls.setItem(DB_PREFIX + k, JSON.stringify(v));

  ctx.AppState.load();
  return ctx;
}

// ── Fixtures ─────────────────────────────────────────────────────────────
export function fixtureNames() {
  if (!fs.existsSync(FIXTURE_DIR)) return [];
  return fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

export function loadFixture(name) {
  const file = path.join(FIXTURE_DIR, name.endsWith('.json') ? name : `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Code direkt im App-Kontext ausführen (für Sonderfälle in Tests)
export function runInApp(ctx, code) {
  return vm.runInContext(code, ctx);
}
