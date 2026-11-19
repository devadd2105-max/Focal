// Measures what is actually in the pixels. No opinions here: judging happens in
// checks.js, where the photographer's stated goal can change what counts as a fault.
import { luma, downscale, boxBlur, sobel, percentile, components, rgbToHsv, clamp } from './pixels.js';
import { geometry } from './geometry.js';
import { impactMetrics } from './impact.js';

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

function toLab(img) {
  const { w, h, data } = img, L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const r = srgbToLin(data[j]), g = srgbToLin(data[j + 1]), b = srgbToLin(data[j + 2]);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    L[i] = 116 * y - 16; A[i] = 500 * (x - y); B[i] = 200 * (y - z);
  }
  return { L, A, B };
}

/* ------------------------------------------------------------------ light */
function lightStats(img) {
  const g = luma(img), n = g.length, hist = new Float64Array(256);
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = clamp(Math.round(g[i]), 0, 255); hist[v]++; sum += v; }
  const mean = sum / n; let acc = 0, p1 = 0, p5 = 0, med = 0, p95 = 0, p99 = 0, sq = 0, hi = 0, lo = 0;
  for (let v = 0; v < 256; v++) {
    const before = acc; acc += hist[v]; sq += hist[v] * (v - mean) ** 2;
    if (before / n < 0.01 && acc / n >= 0.01) p1 = v; if (before / n < 0.05 && acc / n >= 0.05) p5 = v;
    if (before / n < 0.5 && acc / n >= 0.5) med = v; if (before / n < 0.95 && acc / n >= 0.95) p95 = v; if (before / n < 0.99 && acc / n >= 0.99) p99 = v;
    if (v >= 250) hi += hist[v]; if (v <= 5) lo += hist[v];
  }
  const bins = new Array(64).fill(0); for (let v = 0; v < 256; v++) bins[v >> 2] += hist[v] / n;
  const lin = (v) => ((v / 255) ** 2.2);
  return {
    hist: bins, mean, median: med, p1, p5, p95, p99, std: Math.sqrt(sq / n), clipHi: hi / n, clipLo: lo / n,
    range: p99 - p1, evMid: Math.log2(Math.max(lin(med), 1e-4) / 0.18),
    key: med < 85 ? 'low' : med > 170 ? 'high' : 'mid',
    fracDark: bins.slice(0, 10).reduce((a, b) => a + b, 0), fracBright: bins.slice(40).reduce((a, b) => a + b, 0),
  };
}

/* -------------------------------------------------- sharpness and noise */
function laplacian(g, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; out[i] = Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]); }
  return out;
}

// A Laplacian taken on a 3x3-smoothed image: noise is damped much more than real edges.
// NOISE_GAIN is the expected mean |response| of that filter for unit-variance Gaussian noise.
const NOISE_GAIN = 0.502; // measured on flat Gaussian noise: mean |response| = 0.502 x sigma

function sharpness(big) {
  const { w, h } = big, g = luma(big), gs = boxBlur(g, w, h, 1), lap = laplacian(gs, w, h), T = 12, grad = sobel(gs, w, h).mag;
  const tiles = new Float32Array(T * T), cnt = new Float32Array(T * T);
  for (let y = 1; y < h - 1; y++) { const ty = Math.min(T - 1, Math.floor(y * T / h)); for (let x = 1; x < w - 1; x++) { const k = ty * T + Math.min(T - 1, Math.floor(x * T / w)); tiles[k] += lap[y * w + x]; cnt[k]++; } }
  for (let k = 0; k < T * T; k++) tiles[k] = cnt[k] ? tiles[k] / cnt[k] : 0;
  const p90 = percentile(tiles, 0.9), med = percentile(tiles, 0.5), max = Math.max(...tiles);
  let area = 0; for (const v of tiles) if (v >= 0.4 * p90 && v > 1.5) area++;
  return { tiles, T, p90, median: med, max, top: max, area: area / (T * T), g, lap, grad, w, h };
}

/** Immerkaer's fast noise estimator, run only on flat pixels (no edges) so detail is not mistaken for noise. */
function noiseEstimate(g, w, h, lo, hi) {
  const { mag } = sobel(g, w, h), flatT = Math.max(6, percentile(mag, 0.55));
  let s = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = g[i]; if (v < lo || v > hi || mag[i] > flatT) continue;
    const r = g[i - w - 1] - 2 * g[i - w] + g[i - w + 1] - 2 * g[i - 1] + 4 * v - 2 * g[i + 1] + g[i + w - 1] - 2 * g[i + w] + g[i + w + 1];
    s += Math.abs(r); n++;
  }
  return n < w * h * 0.01 ? null : (Math.sqrt(Math.PI / 2) * s / (6 * n));
}

/* --------------------------------------------------------------- saliency */
function integral(a, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += a[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  return I;
}
const boxMean = (I, w, h, x, y, r) => {
  const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r), y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
  const W = w + 1; return (I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0]) / ((x1 - x0 + 1) * (y1 - y0 + 1));
};

function saliency(small, sharp) {
  const { w, h } = small, { L, A, B } = toLab(small), IL = integral(L, w, h), IA = integral(A, w, h), IB = integral(B, w, h);
  const sal = new Float32Array(w * h), scales = [Math.round(w * 0.1), Math.round(w * 0.2), Math.round(w * 0.4)].map((r) => Math.max(3, r));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l0 = boxMean(IL, w, h, x, y, 2), a0 = boxMean(IA, w, h, x, y, 2), b0 = boxMean(IB, w, h, x, y, 2); let s = 0;
    for (const r of scales) { const dl = l0 - boxMean(IL, w, h, x, y, r), da = a0 - boxMean(IA, w, h, x, y, r), db = b0 - boxMean(IB, w, h, x, y, r); s += Math.sqrt(dl * dl + da * da + db * db); }
    sal[y * w + x] = s;
  }
  // sharper regions draw the eye: blend in the tile sharpness map
  const T = sharp.T, ref = Math.max(sharp.p90, 1e-3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sv = sharp.tiles[Math.min(T - 1, Math.floor(y * T / h)) * T + Math.min(T - 1, Math.floor(x * T / w))]; sal[y * w + x] *= 0.65 + 0.35 * clamp(sv / ref, 0, 1.2); }
  const sm = boxBlur(sal, w, h, 1), p99 = percentile(sm, 0.99) || 1;
  for (let i = 0; i < sm.length; i++) sm[i] = clamp(sm[i] / p99, 0, 1);
  return { w, h, map: sm };
}

function blobsFrom(sal) {
  const { w, h, map } = sal, mask = new Uint8Array(w * h);
  const thr = Math.max(0.6, percentile(map, 0.9));
  for (let i = 0; i < mask.length; i++) mask[i] = map[i] >= thr ? 1 : 0;
  const { comps } = components(mask, w, h), total = w * h;
  const blobs = comps.filter((c) => c.area >= total * 0.004).map((c) => {
    let mass = 0; for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) mass += map[y * w + x] * mask[y * w + x];
    return { cx: (c.cx + 0.5) / w, cy: (c.cy + 0.5) / h, x0: c.x0 / w, y0: c.y0 / h, x1: (c.x1 + 1) / w, y1: (c.y1 + 1) / h, area: c.area / total, mass };
  }).sort((a, b) => b.mass - a.mass).slice(0, 6);
  return blobs;
}

/* ----------------------------------------------------------------- colour */
function colourStats(img) {
  const { w, h, data } = img, n = w * h; let sS = 0, nn = 0, rr = 0, gg = 0, bb = 0, cand = 0, rA = 0, gA = 0, bA = 0, midN = 0;
  const hueW = new Float64Array(12), bins = new Map();
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = data[j], g = data[j + 1], b = data[j + 2], [hh, s, v] = rgbToHsv(r, g, b), L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sS += s; nn++;
    if (L > 50 && L < 205) { rA += r; gA += g; bA += b; midN++; if (s < 0.3) { rr += r; gg += g; bb += b; cand++; } }
    if (s > 0.2 && v > 0.2) hueW[Math.floor(hh / 30) % 12] += s * v;
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5), e = bins.get(k) || [0, 0, 0, 0]; e[0]++; e[1] += r; e[2] += g; e[3] += b; bins.set(k, e);
  }
  const useN = cand > n * 0.03 ? cand : midN, R = (cand > n * 0.03 ? rr : rA) / Math.max(1, useN), G = (cand > n * 0.03 ? gg : gA) / Math.max(1, useN), Bc = (cand > n * 0.03 ? bb : bA) / Math.max(1, useN);
  const warm = useN ? Math.log2((R + 1) / (Bc + 1)) : 0, tint = useN ? Math.log2((G + 1) / Math.sqrt((R + 1) * (Bc + 1))) : 0;
  // palette: most common quantised colours, merging near neighbours
  const list = [...bins.values()].sort((a, b) => b[0] - a[0]).map(([c, r, g, b]) => ({ r: r / c, g: g / c, b: b / c, share: c / n }));
  const pal = [];
  for (const c of list) { const m = pal.find((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 60); if (m) m.share += c.share; else pal.push({ ...c }); if (pal.length >= 8) break; }
  pal.sort((a, b) => b.share - a.share);
  const palette = pal.slice(0, 5).map((p) => ({ hex: '#' + [p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''), share: p.share, hue: rgbToHsv(p.r, p.g, p.b)[0], sat: rgbToHsv(p.r, p.g, p.b)[1] }));
  // harmony from the strongest hues
  const tot = hueW.reduce((a, b) => a + b, 0) || 1, hs = [...hueW].map((v, i) => ({ hue: i * 30 + 15, w: v / tot })).filter((o) => o.w > 0.12).sort((a, b) => b.w - a.w);
  const sep = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  let harmony = 'neutral';
  if (tot > 0.5 && n) {
    if (hs.length === 0) harmony = 'neutral';
    else if (hs.length === 1) harmony = 'monochrome';
    else if (hs.length === 2) { const d = sep(hs[0].hue, hs[1].hue); harmony = d >= 150 ? 'complementary' : d <= 60 ? 'analogous' : 'contrast'; }
    else { const hues = hs.map((o) => o.hue); const span = Math.max(...hues.map((a) => Math.max(...hues.map((b) => sep(a, b))))); harmony = span <= 75 ? 'analogous' : hs.length >= 3 && hues.some((a) => hues.some((b) => sep(a, b) >= 150)) ? 'complementary' : 'varied'; }
  }
  return { sat: sS / nn, warm, tint, palette, harmony, hues: hs, neutralShare: cand / n };
}

/* ----------------------------------------------------------------- driver */
export function analyze(src) {
  const big = downscale(src, 1024), work = downscale(src, 360), small = downscale(src, 96), line = downscale(src, 240);
  const light = lightStats(work), sharp = sharpness(big), gBig = sharp.g;
  const noiseAll = noiseEstimate(gBig, big.w, big.h, 8, 247), noiseShadow = noiseEstimate(gBig, big.w, big.h, 8, 70);
  // Noise looks like fine detail to a Laplacian, so take its expected response off every tile.
  if (noiseAll) { const f = NOISE_GAIN * noiseAll; for (let i = 0; i < sharp.tiles.length; i++) sharp.tiles[i] = Math.max(0, sharp.tiles[i] - f); sharp.p90 = percentile(sharp.tiles, 0.9); sharp.median = percentile(sharp.tiles, 0.5); sharp.max = Math.max(...sharp.tiles); sharp.top = sharp.max; let a = 0; for (const v of sharp.tiles) if (v >= 0.4 * sharp.p90 && v > 1.5) a++; sharp.area = a / sharp.tiles.length; }
  // Edge acuity: how steep are the strongest edges? Blur spreads an edge out, which lowers |Laplacian| / |gradient|
  // whatever the contrast. Only edges clearly above the noise are used.
  let acuity = null;
  { const gate = Math.max(30, 9 * (noiseAll || 0)), vals = []; for (let i = 0; i < sharp.grad.length; i++) if (sharp.grad[i] > gate) vals.push(sharp.lap[i] / sharp.grad[i]);
    if (vals.length >= 80) { vals.sort((a, b) => a - b); acuity = vals[Math.floor(vals.length * 0.75)]; } }
  const sal = saliency(small, sharp), blobs = blobsFrom(sal), colour = colourStats(work);
  const geo = geometry({ small, line, work, sal, blobs, sharp });
  const subject = blobs[0] || null;
  const impact = impactMetrics({ lab: toLab(small), sal, subject, work, light, colour });
  // focus-peaking mask at working resolution (for the overlay)
  const gw = luma(work), lw = laplacian(gw, work.w, work.h), thr = Math.max(percentile(lw, 0.93), 6), peak = new Uint8Array(work.w * work.h);
  for (let i = 0; i < lw.length; i++) peak[i] = lw[i] >= thr ? 1 : 0;
  // isolation: is the subject much sharper than its surroundings?
  let isolation = null;
  if (subject) {
    const T = sharp.T; let inS = 0, inN = 0, outS = 0, outN = 0;
    for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) { const cx = (tx + 0.5) / T, cy = (ty + 0.5) / T, v = sharp.tiles[ty * T + tx]; if (cx >= subject.x0 && cx <= subject.x1 && cy >= subject.y0 && cy <= subject.y1) { inS += v; inN++; } else { outS += v; outN++; } }
    if (inN && outN) isolation = { ratio: (inS / inN) / Math.max(outS / outN, 0.5), inside: inS / inN, outside: outS / outN };
  }
  return {
    size: { w: src.w, h: src.h }, aspect: src.w / src.h, light, sharp: { acuity, p90: sharp.p90, top: sharp.top, median: sharp.median, area: sharp.area, tiles: Array.from(sharp.tiles), T: sharp.T },
    noise: { sigma: noiseAll, shadow: noiseShadow }, blobs, subject, sal, colour, isolation, impact, focus: { w: work.w, h: work.h, mask: peak }, ...geo,
  };
}
