// Crop suggestions. Candidates are scored by a cheap model of composition (placement, balance,
// what the crop loses or cuts) using the saliency map, so no pixels need to be re-analysed.

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const P3 = [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]], PG = [[0.382, 0.382], [0.618, 0.382], [0.382, 0.618], [0.618, 0.618]];
const nearestD = (p, pts) => Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));

export const ASPECTS = [{ id: '1:1', label: 'Square 1:1', r: 1 }, { id: '4:5', label: 'Portrait 4:5', r: 0.8 }, { id: '5:4', label: 'Landscape 5:4', r: 1.25 }, { id: '3:2', label: 'Classic 3:2', r: 1.5 }, { id: '2:3', label: 'Tall 2:3', r: 2 / 3 }, { id: '16:9', label: 'Wide 16:9', r: 16 / 9 }];

/** Largest axis-aligned rectangle (w x h) that fits inside an image of size W x H rotated by `deg`. */
export function straightenSize(W, H, deg) {
  const a = Math.abs(deg) * Math.PI / 180; if (a < 1e-6) return { w: W, h: H };
  const sin = Math.abs(Math.sin(a)), cos = Math.abs(Math.cos(a)), longSide = Math.max(W, H), shortSide = Math.min(W, H);
  if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 1e-10) { const x = 0.5 * shortSide; return W >= H ? { w: x / sin, h: x / cos } : { w: x / cos, h: x / sin }; }
  const cos2 = cos * cos - sin * sin; return { w: (W * cos - H * sin) / cos2, h: (H * cos - W * sin) / cos2 };
}

function makeScorer(m) {
  const s = m.subject, sal = m.sal, SW = sal.w, SH = sal.h, total = sal.map.reduce((a, b) => a + b, 0) || 1, hz = m.lines.horizon, W = m.size.w, H = m.size.h;
  const big = m.blobs.filter((b) => b.mass >= 0.4 * (m.blobs[0]?.mass || 1));
  return (r) => {
    if (!s) return 0.5;
    // content retained
    let kept = 0; const x0 = Math.floor(r.x * SW), x1 = Math.ceil((r.x + r.w) * SW), y0 = Math.floor(r.y * SH), y1 = Math.ceil((r.y + r.h) * SH);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) kept += sal.map[y * SW + x];
    const retained = kept / total, rel = (b) => [(b.cx - r.x) / r.w, (b.cy - r.y) / r.h];
    const sub = rel(s), margin = 0.015;
    if (s.x0 < r.x - margin || s.x1 > r.x + r.w + margin || s.y0 < r.y - margin || s.y1 > r.y + r.h + margin) return -1; // would cut the subject
    const t = nearestD(sub, P3), g = nearestD(sub, PG), c = Math.hypot(sub[0] - 0.5, sub[1] - 0.5);
    const place = Math.max(clamp(1 - t / 0.13), clamp(1 - g / 0.1), m.symmetry.lr >= 0.6 ? clamp(1 - c / 0.12) : 0);
    const area = ((s.x1 - s.x0) * (s.y1 - s.y0)) / (r.w * r.h), fill = area < 0.02 ? area / 0.02 : area <= 0.45 ? 1 : clamp(1 - (area - 0.45) / 0.4);
    let bx = 0, by = 0, bw = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = sal.map[y * SW + x] ** 2; bw += v; bx += v * ((x + 0.5) / SW); by += v * ((y + 0.5) / SH); }
    const bal = bw ? 1 - clamp(Math.hypot((bx / bw - r.x) / r.w - 0.5, (by / bw - r.y) / r.h - 0.5) / 0.3) : 0.5;
    let cut = 0; for (const b of big) { if (b === s) continue; const inside = b.cx > r.x && b.cx < r.x + r.w && b.cy > r.y && b.cy < r.y + r.h; if (inside && (b.x0 < r.x - 0.01 || b.x1 > r.x + r.w + 0.01 || b.y0 < r.y - 0.01 || b.y1 > r.y + r.h + 0.01)) cut += 0.12; }
    let horiz = 0.5; if (hz && Math.abs(hz.angle) < 10) { const hy = ((hz.y0 + hz.y1) / 2 - r.y) / r.h; horiz = hy < 0.05 || hy > 0.95 ? 0.5 : Math.max(clamp(1 - Math.abs(hy - 1 / 3) / 0.1), clamp(1 - Math.abs(hy - 2 / 3) / 0.1), 0.2); }
    return clamp(0.42 * place + 0.16 * fill + 0.14 * bal + 0.16 * retained + 0.12 * horiz - cut);
  };
}

export function suggestCrops(m) {
  const s = m.subject; if (!s) return [];
  const W = m.size.w, H = m.size.h, scoreOf = makeScorer(m), whole = scoreOf({ x: 0, y: 0, w: 1, h: 1 }), src = W / H, cands = [];
  const spots = [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3], [0.5, 0.5], [0.382, 0.5], [0.618, 0.5]];
  for (const asp of [{ id: 'orig', label: 'Tighter, same shape', r: src }, ...ASPECTS]) {
    if (asp.id !== 'orig' && Math.abs(asp.r / src - 1) < 0.04) continue;
    let cw = asp.r >= src ? 1 : asp.r / src, ch = asp.r >= src ? src / asp.r : 1; // normalised size of the biggest crop with this aspect
    for (const k of [1, 0.82, 0.66, 0.52]) {
      if (asp.id === 'orig' && k === 1) continue;
      const w = cw * k, h = ch * k;
      for (const [px, py] of spots) {
        const x = clamp(s.cx - px * w, 0, 1 - w), y = clamp(s.cy - py * h, 0, 1 - h), r = { x, y, w, h }, sc = scoreOf(r);
        if (sc < 0) continue;
        cands.push({ ...r, id: asp.id, label: asp.label, score: sc, k });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), i = ix * iy; return i / (a.w * a.h + b.w * b.h - i); };
  const picks = [];
  for (const c of cands) {
    if (picks.length >= 3) break;
    if (c.score - whole < 0.04 || picks.some((p) => iou(p, c) > 0.65 || p.id === c.id)) continue;
    picks.push(c);
  }
  return picks.map((c) => ({
    id: c.id, label: c.label, rect: { x: c.x, y: c.y, w: c.w, h: c.h }, px: { x: Math.round(c.x * W), y: Math.round(c.y * H), w: Math.round(c.w * W), h: Math.round(c.h * H) },
    gain: Math.round((c.score - whole) * 100), why: reason(m, c, s),
  }));
}

function reason(m, c, s) {
  const sx = (s.cx - c.x) / c.w, sy = (s.cy - c.y) / c.h, nearest = P3.map((p) => ({ p, d: Math.hypot(sx - p[0], sy - p[1]) })).sort((a, b) => a.d - b.d)[0];
  const bits = [];
  if (nearest.d < 0.08) bits.push(`puts the subject on a thirds point (${nearest.p[0] < 0.5 ? 'left' : 'right'}, ${nearest.p[1] < 0.5 ? 'upper' : 'lower'})`);
  else if (Math.hypot(sx - 0.5, sy - 0.5) < 0.08) bits.push('centres the subject');
  else bits.push('moves the subject to a stronger position');
  const area = ((s.x1 - s.x0) * (s.y1 - s.y0)) / (c.w * c.h);
  if (c.w * c.h < 0.75 && area > ((s.x1 - s.x0) * (s.y1 - s.y0)) * 1.3) bits.push('makes the subject larger');
  return bits.join(' and ');
}
