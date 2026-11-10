// feat/athlete-mode Phase C – Design und UI
import fs from 'node:fs';
import path from 'node:path';

export const title = 'Design · Tokens, Kontrast, Heute, Workout, Plan-Menü, Icons, a11y';

// WCAG-Kontrast zweier Hex-Farben
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export default function ({ test, assert, loadApp, REPO_ROOT }) {
  const html = () => fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const tokens = () => {
    const root = html().match(/:root\{([\s\S]*?)\}/)[1], t = {};
    for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) t[m[1]] = m[2];
    return t;
  };

  test('C1 Tokens: Abstände, --t3, gefüllte rote Knöpfe', () => {
    const src = html();
    assert.match(src, /--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px/);
    const t = tokens();
    assert.equal(t.t3.toUpperCase(), '#8E8E93');
    assert.equal(t['accent-fill'].toUpperCase(), '#D32F2F');
    assert.match(src, /\.bp\{background:var\(--accent-fill\)/);
  });

  test('C1 Kontrast: Textfarben ≥ 4,5:1 gegen die Hintergründe', () => {
    const t = tokens();
    for (const fg of ['t1', 't2', 't3']) for (const bg of ['bg', 'card', 'card2']) {
      const r = contrast(t[fg], t[bg]);
      assert.ok(r >= 4.5, `--${fg} auf --${bg}: ${r.toFixed(2)}`);
    }
    for (const fg of ['t1', 't2']) assert.ok(contrast(t[fg], t.card3) >= 4.5, `--${fg} auf --card3`);
    assert.ok(contrast('#FFFFFF', t['accent-fill']) >= 4.5, 'Weiß auf --accent-fill');
    // --t3 nie als Textfarbe auf --card3 (dort nur 4,28:1)
    assert.doesNotMatch(html(), /background:var\(--card3\)[^"'>}\n]*color:var\(--t3\)|color:var\(--t3\)[^"'>}\n]*background:var\(--card3\)/);
  });

  test('C1 Schrift mindestens 12 px, nur das Nav-Label 11 px', () => {
    const src = html();
    const small = [...src.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => +m[1]).filter((v) => v < 12);
    assert.equal(small.length, 1, 'genau eine Ausnahme');
    assert.match(src, /\.nl\{font-size:11px/);
    const short = [...src.matchAll(/font:\s*\d+\s+([0-9.]+)px/g)].map((m) => +m[1]).filter((v) => v < 12);
    assert.equal(short.length, 0);
  });
}
