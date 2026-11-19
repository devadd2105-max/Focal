import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../js/analyze.js';
import { evaluate } from '../js/checks.js';
import { parseIntent } from '../js/intent.js';
import { parseExif, formatShutter } from '../js/exif.js';
import { settingsFromForm } from '../js/settings.js';
import { straightenSize, suggestCrops } from '../js/crops.js';
import { landscape, minimal, symmetric, silhouette, lowKey, addNoise, blurImg, grade, road } from '../js/scenes.js';

const ids = (r) => r.findings.filter((f) => f.state === 'issue').map((f) => f.id);

test('horizon angle is measured to within a degree', () => {
  for (const a of [0, 3, -3, 5]) {
    const m = analyze(landscape({ angle: a })), hz = m.lines.horizon;
    assert.ok(hz, `horizon found at ${a}`); assert.ok(Math.abs(hz.angle - a) < 1, `angle ${hz.angle} vs ${a}`);
  }
});
test('a tilted horizon is flagged with the right correction, a level one is not', () => {
  const tilted = evaluate(analyze(landscape({ angle: 4 }))).findings.find((f) => f.id === 'horizon');
  assert.equal(tilted.state, 'issue'); assert.ok(Math.abs(tilted.rotate + 4) < 1);
  assert.equal(evaluate(analyze(landscape({ angle: 0 }))).findings.find((f) => f.id === 'horizon').state, 'good');
});
test('exposure: dark and bright grades are detected', () => {
  assert.ok(ids(evaluate(analyze(grade(landscape({}), [1, 1, 1], 0.2)))).includes('exposure'));
  assert.ok(ids(evaluate(analyze(grade(landscape({}), [1, 1, 1], 2.6)))).includes('exposure'));
});
test('blur is flagged, grain is not mistaken for sharpness', () => {
  assert.ok(ids(evaluate(analyze(blurImg(landscape({}), 4)))).includes('focus'));
  assert.ok(!ids(evaluate(analyze(landscape({})))).includes('focus'));
  const n = evaluate(analyze(addNoise(landscape({}), 25)));
  assert.ok(ids(n).includes('noise'));
});
test('colour cast is detected', () => {
  assert.ok(ids(evaluate(analyze(grade(landscape({}), [1.8, 1, 0.4], 1)))).includes('cast'));
});
test('symmetry and silhouette techniques are recognised', () => {
  const sym = evaluate(analyze(symmetric({}))).techniques.find((t) => t.id === 'symmetry');
  assert.ok(sym.used);
  const w = 400, h = 300, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, dark = y > 120 && (x < 160 || y > 210), v = dark ? 6 : 120 + 110 * (1 - y / 120); data[i] = v; data[i + 1] = v * 0.9; data[i + 2] = v * 0.75; data[i + 3] = 255; }
  assert.ok(evaluate(analyze({ w, h, data })).techniques.find((t) => t.id === 'silhouette').used);
});
test('goal embraces a deliberate fault', () => {
  const m = analyze(lowKey({})), plain = evaluate(m), goal = evaluate(m, { goals: parseIntent('moody low key night').goals });
  assert.ok(goal.overall >= plain.overall);
  assert.ok(goal.intents.length > 0 || goal.goalMatch !== null);
});
test('intent parser reads words and reports unknowns', () => {
  assert.ok(parseIntent('a portrait for linkedin').matched.some((x) => x.id === 'portrait'));
  assert.equal(parseIntent('zzzz qqqq').unknown, true);
  assert.equal(parseIntent('', ['street']).matched[0].id, 'street');
});
test('scores stay in range', () => {
  for (const img of [landscape({}), minimal({}), road({}), lowKey({})]) {
    const r = evaluate(analyze(img)); assert.ok(r.overall >= 5 && r.overall <= 98);
    for (const v of Object.values(r.scores)) assert.ok(v >= 5 && v <= 100);
  }
});
test('settings form and shake rule', () => {
  const s = settingsFromForm({ aperture: 'f/2.8', shutter: '1/15', iso: '800', focal: '200' });
  assert.equal(s.aperture, 2.8); assert.ok(Math.abs(s.shutter - 1 / 15) < 1e-9);
  assert.equal(settingsFromForm({}), null);
  const r = evaluate(analyze(blurImg(landscape({}), 4)), { settings: s });
  assert.ok(ids(r).includes('shake'));
});
test('straighten size shrinks to the inscribed rectangle', () => {
  const z = straightenSize(1000, 800, 0); assert.deepEqual(z, { w: 1000, h: 800 });
  const t = straightenSize(1000, 800, 5); assert.ok(t.w < 1000 && t.h < 800 && t.w / t.h > 1);
});
test('crop suggestions stay inside the frame', () => {
  for (const c of suggestCrops(analyze(minimal({ at: [0.5, 0.5] })))) {
    assert.ok(c.rect.x >= 0 && c.rect.y >= 0 && c.rect.x + c.rect.w <= 1.0001 && c.rect.y + c.rect.h <= 1.0001);
  }
});
test('exif reader parses a hand-built JPEG header', () => {
  const be = (n, len) => Array.from({ length: len }, (_, i) => (n >>> (8 * (len - 1 - i))) & 255);
  const entry = (tag, type, count, val) => [...be(tag, 2), ...be(type, 2), ...be(count, 4), ...val];
  // TIFF (big-endian): IFD0 -> ExifIFD pointer; ExifIFD -> ISO 400
  const exifIfd = [...be(1, 2), ...entry(0x8827, 3, 1, [...be(400, 2), 0, 0]), ...be(0, 4)];
  const ifd0 = [...be(1, 2), ...entry(0x8769, 4, 1, be(8 + 2 + 12 + 4, 4)), ...be(0, 4)];
  const tiff = [0x4d, 0x4d, 0, 42, ...be(8, 4), ...ifd0, ...exifIfd];
  const app1 = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff);
  const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...be(app1.length + 2, 2), ...app1, 0xff, 0xd9]).buffer;
  assert.equal(parseExif(buf).iso, 400);
  assert.equal(parseExif(new Uint8Array([1, 2, 3]).buffer), null);
  assert.equal(formatShutter(1 / 250), '1/250 s');
});

/* ---- impact, scene-aware exposure, histogram shapes --------------------------------------- */
import { render } from '../js/scenes.js';
import { histogramShape } from '../js/impact.js';

const dot = (u, v, cx, cy, r) => Math.hypot(u - cx, v - cy) <= r;
// a calm, graded backdrop with one round subject
const subjectScene = (subj, bg) => render(320, 240, (u, v) => (dot(u * 4 / 3, v, 0.667, 0.5, 0.2) ? subj : bg.map((c, i) => c + (i === 2 ? 12 : 6) * v)));

test('a subject that stands out scores higher impact than one that blends in', () => {
  const strong = evaluate(analyze(subjectScene([220, 40, 50], [70, 120, 90]))), weak = evaluate(analyze(subjectScene([118, 122, 118], [112, 118, 114])));
  assert.ok(strong.scores.impact > weak.scores.impact + 8, `impact ${strong.scores.impact} vs ${weak.scores.impact}`);
  assert.ok(strong.strengths.some((s) => /stands out/i.test(s.title)));
  assert.ok(ids(weak).includes('blends'), 'blending subject flagged');
});
test('a technically clean but plain picture no longer scores near the top', () => {
  const r = evaluate(analyze(subjectScene([118, 122, 118], [112, 118, 114])));
  assert.ok(r.overall < 88, `overall ${r.overall}`);
  assert.ok(r.scores.impact < 70);
});
test('a night scene with bright lights is not called simply underexposed', () => {
  const night = render(320, 240, (u, v) => (dot(u * 4 / 3, v, 0.5, 0.45, 0.025) || dot(u * 4 / 3, v, 0.8, 0.55, 0.02) ? [255, 235, 190] : [6, 7, 12]));
  const e = evaluate(analyze(night)).findings.find((f) => f.id === 'exposure');
  assert.ok(e && /Dark scene/.test(e.title), e && e.title); assert.ok(e.severity < 0.4);
  const dim = evaluate(analyze(render(320, 240, (u, v) => [10 + 8 * u, 10 + 8 * v, 14]))).findings.find((f) => f.id === 'exposure');
  assert.equal(dim.title, 'Underexposed', 'a uniformly dim picture still is');
});
test('histogram shapes are named', () => {
  const mk = (hist, extra) => ({ hist, p1: 0, p99: 255, key: 'mid', ...extra });
  const spread = (lo, hi) => { const h = new Array(64).fill(0); for (let i = lo; i < hi; i++) h[i] = 1 / (hi - lo); return h; };
  assert.equal(histogramShape(mk(spread(0, 8), { p99: 40 })).id, 'under');
  assert.equal(histogramShape(mk(spread(56, 64), { p1: 220 })).id, 'over');
  assert.equal(histogramShape(mk(spread(26, 38), { p1: 100, p99: 160 })).id, 'dull');
  assert.equal(histogramShape(mk(spread(6, 58))).id, 'balanced');
});
test('three separated elements are read as a triangle', () => {
  const tri = render(320, 240, (u, v) => ([[0.25, 0.75], [0.75, 0.75], [0.5, 0.25]].some(([x, y]) => dot(u, v, x, y, 0.07)) ? [235, 200, 60] : [40, 50, 70]));
  assert.ok(evaluate(analyze(tri)).techniques.find((t) => t.id === 'triangles').used);
});

test('a horizon in the middle is flagged, one on a third is praised', () => {
  const pos = (h) => evaluate(analyze(landscape({ horizon: h }))).findings.find((f) => f.id === 'horizonPos');
  assert.equal(pos(0.5)?.state, 'issue');
  assert.notEqual(pos(0.667)?.state, 'issue');
});
