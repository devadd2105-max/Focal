// Shape-level measurements: lines, horizon, vanishing point, symmetry, empty space,
// repetition, framing. Everything is returned in 0..1 image coordinates.
import { luma, boxBlur, sobel, percentile, components, clamp } from './pixels.js';

const RAD = Math.PI / 180;
const wrap90 = (a) => { while (a > 90) a -= 180; while (a <= -90) a += 180; return a; };

/** Hough transform restricted to each edge pixel's own gradient direction. Returns the strongest straight lines. */
function findLines(img) {
  const { w, h } = img, g = boxBlur(luma(img), w, h, 1), { gx, gy, mag } = sobel(g, w, h);
  const thr = Math.max(percentile(mag, 0.92), 40), diag = Math.hypot(w, h), nR = Math.ceil(diag) * 2 + 1, off = Math.ceil(diag);
  const acc = new Float32Array(180 * nR), cnt = new Float32Array(180 * nR), cs = [], sn = [];
  for (let t = 0; t < 180; t++) { cs.push(Math.cos(t * RAD)); sn.push(Math.sin(t * RAD)); }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = mag[i]; if (m < thr) continue;
    let th = Math.round(Math.atan2(gy[i], gx[i]) / RAD); th = ((th % 180) + 180) % 180;
    for (let d = -6; d <= 6; d++) {
      const t = (th + d + 180) % 180, rho = Math.round(x * cs[t] + y * sn[t]) + off;
      acc[t * nR + rho] += m; cnt[t * nR + rho]++;
    }
  }
  const minCount = 0.3 * Math.min(w, h), peaks = [];
  for (let t = 0; t < 180; t++) for (let r = 2; r < nR - 2; r++) {
    const c = cnt[t * nR + r]; if (c < minCount) continue;
    let isMax = true;
    for (let dt = -3; dt <= 3 && isMax; dt++) for (let dr = -4; dr <= 4; dr++) { if (!dt && !dr) continue; const tt = (t + dt + 180) % 180, rr = r + dr; if (rr >= 0 && rr < nR && cnt[tt * nR + rr] > c) { isMax = false; break; } }
    if (isMax) {
      // sub-degree refinement: parabola through the counts of the neighbouring angles
      const at = (tt) => { let m = 0; for (let dr = -3; dr <= 3; dr++) { const rr = r + dr; if (rr >= 0 && rr < nR) m = Math.max(m, cnt[((tt + 180) % 180) * nR + rr]); } return m; };
      const cm = at(t - 1), cp = at(t + 1), den = cm - 2 * c + cp, delta = den < -1e-6 ? clamp(0.5 * (cm - cp) / den, -1, 1) : 0;
      peaks.push({ t, tf: t + delta, rho: r - off, count: c, weight: acc[t * nR + r] });
    }
  }
  peaks.sort((a, b) => b.count - a.count);
  const lines = [];
  for (const p of peaks) {
    if (lines.length >= 14) break;
    const th = p.tf * RAD, c = Math.cos(th), s = Math.sin(th), ang = wrap90(Math.atan2(c, -s) / RAD);
    // clip the infinite line to the frame
    const pts = [];
    const tryPt = (x, y) => { if (x >= -0.5 && x <= w + 0.5 && y >= -0.5 && y <= h + 0.5) pts.push([clamp(x, 0, w), clamp(y, 0, h)]); };
    if (Math.abs(s) > 1e-6) { tryPt(0, p.rho / s); tryPt(w, (p.rho - w * c) / s); }
    if (Math.abs(c) > 1e-6) { tryPt(p.rho / c, 0); tryPt((p.rho - h * s) / c, h); }
    if (pts.length < 2) continue;
    let a = pts[0], b = pts[1], best = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d > best) { best = d; a = pts[i]; b = pts[j]; } }
    lines.push({ angle: ang, count: p.count, len: p.count / Math.min(w, h), x0: a[0] / w, y0: a[1] / h, x1: b[0] / w, y1: b[1] / h, nx: c, ny: s, rho: p.rho / diag, w, h });
  }
  return lines;
}

function vanishing(lines, w, h) {
  const cand = lines.filter((l) => { const a = Math.abs(l.angle); return a >= 18 && a <= 82; });
  if (cand.length < 2) return null;
  const pts = [];
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
    const a = cand[i], b = cand[j], det = a.nx * b.ny - a.ny * b.nx; if (Math.abs(det) < 0.12) continue;
    const ra = a.rho * Math.hypot(w, h), rb = b.rho * Math.hypot(w, h), x = (ra * b.ny - rb * a.ny) / det, y = (a.nx * rb - b.nx * ra) / det;
    if (x < -0.6 * w || x > 1.6 * w || y < -0.6 * h || y > 1.6 * h) continue;
    pts.push({ x: x / w, y: y / h, weight: Math.sqrt(a.count * b.count), i, j });
  }
  let best = null;
  for (const p of pts) {
    let wsum = 0, near = new Set();
    for (const q of pts) if (Math.hypot(p.x - q.x, p.y - q.y) < 0.08) { wsum += q.weight; near.add(q.i); near.add(q.j); }
    if (!best || wsum > best.wsum) best = { x: p.x, y: p.y, wsum, lines: near.size };
  }
  return best && best.lines >= 3 ? { x: best.x, y: best.y, lines: best.lines, inside: best.x >= 0 && best.x <= 1 && best.y >= 0 && best.y <= 1 } : null;
}

function mirror(small) {
  const { w, h } = small, g = boxBlur(luma(small), w, h, 0), { mag } = sobel(g, w, h), e = boxBlur(mag, w, h, 1);
  // weighted Jaccard overlap of the edge map with its own mirror image: smooth sky/sea gradients carry no edges,
  // so only real shapes can make a picture look symmetric
  let aLR = 0, bLR = 0, aTB = 0, bTB = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = e[y * w + x], l = e[y * w + (w - 1 - x)], t = e[(h - 1 - y) * w + x];
    aLR += Math.min(v, l); bLR += Math.max(v, l); aTB += Math.min(v, t); bTB += Math.max(v, t);
  }
  const ok = bLR > w * h * 2;
  return { lr: ok ? aLR / bLR : 0, tb: ok ? aTB / bTB : 0 };
}

function emptySpace(small) {
  const { w, h } = small, g = boxBlur(luma(small), w, h, 0), { mag } = sobel(g, w, h), energy = boxBlur(mag, w, h, 2);
  const calm = new Uint8Array(w * h); let total = 0;
  for (let i = 0; i < calm.length; i++) { calm[i] = energy[i] < 26 ? 1 : 0; total += calm[i]; }
  const { comps } = components(calm, w, h); comps.sort((a, b) => b.area - a.area);
  const c = comps[0];
  return { total: total / (w * h), largest: c ? c.area / (w * h) : 0, cx: c ? (c.cx + 0.5) / w : 0.5, cy: c ? (c.cy + 0.5) / h : 0.5, x0: c ? c.x0 / w : 0, y0: c ? c.y0 / h : 0, x1: c ? (c.x1 + 1) / w : 0, y1: c ? (c.y1 + 1) / h : 0, mask: calm, w, h };
}

function repetition(small) {
  const { w, h } = small, g = luma(small), bl = boxBlur(g, w, h, 3), hp = new Float32Array(w * h);
  for (let i = 0; i < hp.length; i++) hp[i] = g[i] - bl[i];
  let energy = 0; for (const v of hp) energy += v * v;
  if (energy < w * h * 4) return { strength: 0, period: 0, axis: null };
  let best = { strength: 0, period: 0, axis: null };
  const scan = (axis) => {
    const len = axis === 'x' ? w : h, maxLag = Math.floor(len / 2), r = [];
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0, n = 0;
      if (axis === 'x') { for (let y = 0; y < h; y++) for (let x = 0; x + lag < w; x++) { s += hp[y * w + x] * hp[y * w + x + lag]; n++; } }
      else { for (let y = 0; y + lag < h; y++) for (let x = 0; x < w; x++) { s += hp[y * w + x] * hp[(y + lag) * w + x]; n++; } }
      r.push(n ? s / n : 0);
    }
    const r0 = r[0] || 1; let seenDip = false;
    for (let lag = 1; lag < r.length - 1; lag++) {
      const v = r[lag] / r0; if (v < 0.15) seenDip = true;
      if (seenDip && lag >= 5 && r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && v > best.strength) best = { strength: v, period: lag / len, axis };
    }
  };
  scan('x'); scan('y');
  return best;
}

function framing(small) {
  const { w, h } = small, g = luma(small), ring = 0.16; let rs = 0, rn = 0, is = 0, inn = 0, ringDark = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / w, fy = y / h, edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    if (edge < ring) { rs += g[y * w + x]; rn++; } else { is += g[y * w + x]; inn++; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const fx = x / w, fy = y / h, edge = Math.min(fx, 1 - fx, fy, 1 - fy); if (edge < ring && g[y * w + x] < is / inn - 35) ringDark++; }
  return { diff: is / inn - rs / rn, ringDarkShare: ringDark / rn };
}

export function geometry({ small, line, work, sal, blobs }) {
  const lines = findLines(line), W = line.w, H = line.h;
  const horizon0 = lines.filter((l) => Math.abs(l.angle) <= 20 && l.len >= 0.4 * (W / Math.min(W, H))).sort((a, b) => b.count - a.count)[0] || null;
  // Two long near-horizontal lines that slope opposite ways converge, which is perspective rather than a tilted camera.
  const horizon = horizon0 && { ...horizon0, converging: Math.abs(horizon0.angle) >= 2 && lines.some((l) => l !== horizon0 && Math.abs(l.angle) <= 25 && Math.abs(l.angle) >= 2 && Math.sign(l.angle) !== Math.sign(horizon0.angle) && l.len >= 0.4 * horizon0.len) };
  const verticals = lines.filter((l) => Math.abs(l.angle) >= 70 && l.len >= 0.3 * (H / Math.min(W, H)));
  const vDev = verticals.map((l) => (l.angle > 0 ? 90 - l.angle : -90 - l.angle));
  const vMed = vDev.length ? vDev.sort((a, b) => a - b)[Math.floor(vDev.length / 2)] : null;
  const tangents = [];
  for (const l of lines) {
    const a = Math.abs(l.angle), hor = a <= 8, ver = a >= 82; if (!hor && !ver) continue;
    const pos = hor ? (l.y0 + l.y1) / 2 : (l.x0 + l.x1) / 2, d = Math.min(pos, 1 - pos), side = hor ? (pos < 0.5 ? 'top' : 'bottom') : (pos < 0.5 ? 'left' : 'right');
    if (d > 0.003 && d <= 0.03 && l.len >= (hor ? 0.4 : 0.3)) tangents.push({ side, distance: d });
  }
  const cutSides = [], s = blobs[0], sm = sal.map, SW = sal.w, SH = sal.h;
  // a side only counts as "cut" if the main subject reaches it AND salient pixels cover a real stretch of that edge
  const edgeCover = (pts) => pts.filter(([x, y]) => sm[y * SW + x] > 0.6).length / pts.length;
  const col = (x) => Array.from({ length: SH }, (_, y) => [x, y]), row = (y) => Array.from({ length: SW }, (_, x) => [x, y]);
  if (s && s.area >= 0.02) {
    if (s.x0 <= 0.012 && edgeCover(col(0)) >= 0.15) cutSides.push('left'); if (s.x1 >= 0.988 && edgeCover(col(SW - 1)) >= 0.15) cutSides.push('right');
    if (s.y0 <= 0.012 && edgeCover(row(0)) >= 0.15) cutSides.push('top'); if (s.y1 >= 0.988 && edgeCover(row(SH - 1)) >= 0.15) cutSides.push('bottom');
  }
  const diagLen = lines.reduce((a, l) => a + l.count, 0) || 1;
  const diagShare = lines.filter((l) => { const a = Math.abs(l.angle); return a >= 30 && a <= 60; }).reduce((a, l) => a + l.count, 0) / diagLen;
  // balance: centre of visual weight
  const sw = sal.map; let bw = 0, bx = 0, by = 0;
  for (let y = 0; y < sal.h; y++) for (let x = 0; x < sal.w; x++) { const v = sw[y * sal.w + x] ** 2; bw += v; bx += v * (x + 0.5); by += v * (y + 0.5); }
  const balance = bw ? { x: bx / bw / sal.w, y: by / bw / sal.h } : { x: 0.5, y: 0.5 };
  // layers (rough): does detail and tone change from bottom to middle to top?
  const g = luma(work), bandMean = [0, 0, 0], bandDet = [0, 0, 0], bandN = [0, 0, 0];
  for (let y = 1; y < work.h - 1; y++) { const b = Math.min(2, Math.floor(y * 3 / work.h)); for (let x = 1; x < work.w - 1; x++) { const i = y * work.w + x; bandMean[b] += g[i]; bandDet[b] += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - work.w] - g[i + work.w]); bandN[b]++; } }
  for (let b = 0; b < 3; b++) { bandMean[b] /= bandN[b] || 1; bandDet[b] /= bandN[b] || 1; }
  const fg = bandDet[2] > 1.5 * bandDet[1] && bandDet[2] > 4, haze = bandDet[0] < 0.7 * bandDet[1] && bandMean[0] > bandMean[1] + 8;
  return {
    lines: { list: lines.map(({ nx, ny, rho, w, h, ...l }) => l), horizon, verticalTilt: vMed, verticalCount: verticals.length, vanishing: vanishing(lines, W, H), diagShare, tangents, cutSides },
    symmetry: mirror(small), space: emptySpace(small), repeat: repetition(small), frame: framing(small), balance,
    layers: { fg, haze, count: 1 + (fg ? 1 : 0) + (haze ? 1 : 0), bandDetail: bandDet },
  };
}
