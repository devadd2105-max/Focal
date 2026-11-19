// Measures what makes a picture work, beyond whether it has faults:
// subject separation, clutter, edge distractions, scattered highlights, light character, histogram shape.
// Like analyze.js this only measures. checks.js decides what it means.
import { luma, components, clamp } from './pixels.js';

/** Name the histogram shape, using the five shapes photographers are taught to recognise. */
export function histogramShape(L) {
  const lowQ = L.hist.slice(0, 16).reduce((a, b) => a + b, 0), highQ = L.hist.slice(48).reduce((a, b) => a + b, 0);
  const mid = L.hist.slice(16, 48).reduce((a, b) => a + b, 0), range = L.p99 - L.p1;
  if (lowQ > 0.7 && L.p99 < 150) return { id: 'under', label: 'Underexposed', note: 'Nearly all the tones are bunched at the dark end, so shadow detail is muddy or lost.' };
  if (highQ > 0.7 && L.p1 > 90) return { id: 'over', label: 'Overexposed', note: 'Nearly all the tones are bunched at the bright end, so highlight detail is washed out.' };
  if (range < 110 && L.p1 > 30 && L.p99 < 225) return { id: 'dull', label: 'Dull', note: 'Tones sit in a narrow middle band with no real black or white, so the picture looks flat and hazy.' };
  if (lowQ > 0.25 && highQ > 0.2 && mid < 0.45) return { id: 'contrast', label: 'High contrast', note: 'Lots of dark and bright tones with little in between. Good for drama, but detail can vanish at both ends.' };
  if (L.key === 'low') return { id: 'lowkey', label: 'Low-key', note: 'Mostly dark tones. Fine for night or moody scenes if a few bright accents carry the picture.' };
  return { id: 'balanced', label: 'Well spread', note: 'Tones spread from shadows to highlights without piling up at either end.' };
}

/**
 * @param src   {small, lab, sal, subject, work, light, colour}
 */
export function impactMetrics({ lab, sal, subject, work, light, colour }) {
  const { w, h, map } = sal, W = work.w, H = work.h, g = luma(work), n = W * H;

  // value (max channel) median: a saturated colour can look bright even though its luma is low
  const vs = new Uint16Array(256); for (let i = 0, j = 0; i < n; i++, j += 4) vs[Math.max(work.data[j], work.data[j + 1], work.data[j + 2])]++;
  let acc = 0, vMedian = 0, vHi = 255; for (let v = 0; v < 256; v++) { acc += vs[v]; if (!vMedian && acc >= n / 2) vMedian = v; if (acc >= n * 0.99) { vHi = v; break; } }

  const out = { vMedian, vHi, histogram: histogramShape(light), separation: null, deltaE: null, lumDiff: null, clutter: null, dominance: null, edge: null, glare: null, direction: null, quality: null, golden: false, concentration: null };

  // light character
  const range = light.range;
  out.quality = range >= 170 && light.fracDark >= 0.12 && light.fracBright >= 0.12 ? 'hard' : range <= 110 && light.std < 45 ? 'soft' : 'moderate';
  out.golden = colour.warm > 0.4 && colour.sat > 0.2;
  out.concentration = (colour.palette[0]?.share || 0) + (colour.palette[1]?.share || 0);

  if (!subject) return out;
  const inBox = (x, y, pad = 0) => { const u = (x + 0.5) / w, v = (y + 0.5) / h; return u >= subject.x0 - pad && u <= subject.x1 + pad && v >= subject.y0 - pad && v <= subject.y1 + pad; };

  // separation: how different is the subject from what surrounds it?
  let sN = 0, sL = 0, sA = 0, sB = 0, bN = 0, bL = 0, bA = 0, bB = 0, busy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (inBox(x, y) && map[i] >= 0.4) { sN++; sL += lab.L[i]; sA += lab.A[i]; sB += lab.B[i]; }
    else if (!inBox(x, y, 0.04)) { bN++; bL += lab.L[i]; bA += lab.A[i]; bB += lab.B[i]; if (map[i] >= 0.3) busy++; }
  }
  if (sN >= 6 && bN >= 20) {
    const dL = sL / sN - bL / bN, dA = sA / sN - bA / bN, dB = sB / sN - bB / bN;
    out.deltaE = Math.hypot(dL, dA, dB); out.lumDiff = Math.abs(dL); out.separation = clamp(out.deltaE / 40, 0, 1); out.clutter = busy / bN;
  }

  // edge distractions: strong marks hugging the border that are not the subject
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.07)), sides = { left: [0, 0], right: [0, 0], top: [0, 0], bottom: [0, 0] };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sd = x < band ? 'left' : x >= w - band ? 'right' : y < band ? 'top' : y >= h - band ? 'bottom' : null; if (!sd) continue;
    sides[sd][1]++; if (map[y * w + x] >= 0.45 && !inBox(x, y, 0.02)) sides[sd][0]++;
  }
  const worst = Object.entries(sides).map(([side, [a, t]]) => ({ side, share: t ? a / t : 0 })).sort((a, b) => b.share - a.share)[0];
  if (worst && worst.share >= 0.22) out.edge = worst;

  // scattered bright highlights outside the subject (water glare, specular spots)
  const mask = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = g[i] >= 238 ? 1 : 0;
  const { comps } = components(mask, W, H); let cnt = 0, share = 0;
  for (const c of comps) {
    if (c.area < 4 || c.area > n * 0.01) continue;
    const u = (c.cx + 0.5) / W, v = (c.cy + 0.5) / H; if (u >= subject.x0 - 0.02 && u <= subject.x1 + 0.02 && v >= subject.y0 - 0.02 && v <= subject.y1 + 0.02) continue;
    cnt++; share += c.area / n;
  }
  if (cnt) out.glare = { count: cnt, share };

  // light direction on the subject (brighter side)
  const x0 = Math.floor(subject.x0 * W), x1 = Math.max(x0 + 2, Math.floor(subject.x1 * W)), y0 = Math.floor(subject.y0 * H), y1 = Math.max(y0 + 2, Math.floor(subject.y1 * H)), mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
  let l = 0, r = 0, t = 0, b = 0, nl = 0, nr = 0, nt = 0, nb = 0;
  for (let y = y0; y < y1 && y < H; y++) for (let x = x0; x < x1 && x < W; x++) { const v = g[y * W + x]; if (x < mx) { l += v; nl++; } else { r += v; nr++; } if (y < my) { t += v; nt++; } else { b += v; nb++; } }
  if (nl && nr && nt && nb) {
    const lr = (r / nr - l / nl) / (r / nr + l / nl + 1), tb = (t / nt - b / nb) / (t / nt + b / nb + 1);
    out.direction = Math.abs(lr) >= 0.12 && Math.abs(lr) >= Math.abs(tb) ? { kind: 'side', from: lr > 0 ? 'right' : 'left', amount: Math.abs(lr) } : tb >= 0.12 ? { kind: 'top', amount: tb } : tb <= -0.12 ? { kind: 'below', amount: -tb } : { kind: 'even', amount: Math.max(Math.abs(lr), Math.abs(tb)) };
  }
  return out;
}
