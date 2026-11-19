// Synthetic scenes with known ground truth. They power the "Try a sample" buttons and the tests:
// when a horizon is drawn at exactly 3 degrees, the analysis had better find 3 degrees.

export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Draw a scene from a per-pixel function f(u, v) -> [r, g, b], with u, v in 0..1. */
export function render(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f((x + 0.5) / w, (y + 0.5) / h), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return { w, h, data };
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash = (x, y, s = 7) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise2 = (u, v, f, s) => { const x = u * f, y = v * f, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, sm = (t) => t * t * (3 - 2 * t); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * sm(tx) + (c - a) * sm(ty) + (a - b - c + d) * sm(tx) * sm(ty); };
const fbm = (u, v, s) => 0.5 * noise2(u, v, 6, s) + 0.3 * noise2(u, v, 14, s + 1) + 0.2 * noise2(u, v, 34, s + 2);
const disc = (u, v, cx, cy, r, aspect = 1) => Math.hypot((u - cx) * aspect, v - cy) <= r;

/** A seaside landscape. `angle` tilts the whole picture (degrees, positive = clockwise); `subject` places a lighthouse. */
export function landscape({ w = 480, h = 320, angle = 0, horizon = 0.62, subject = [0.667, 0.5], sun = true, seed = 3 } = {}) {
  const a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), asp = w / h;
  return render(w, h, (u0, v0) => {
    // rotate sampling coordinates about the centre so there are no empty corners
    const dx = (u0 - 0.5) * asp, dy = v0 - 0.5, u = (dx * ca + dy * sa) / asp + 0.5, v = -dx * sa + dy * ca + 0.5;
    let c;
    if (v < horizon) { c = mix([70, 120, 190], [250, 200, 160], Math.pow(v / horizon, 1.6)); if (sun && disc(u, v, 0.28, horizon - 0.16, 0.05, asp)) c = [255, 250, 220]; const cl = noise2(u, v, 7, seed); if (cl > 0.62 && v < horizon * 0.8) c = mix(c, [255, 255, 255], 0.5); }
    else { const t = (v - horizon) / (1 - horizon), wave = fbm(u * 3, v * 14, seed) * 0.5; c = mix([40, 90, 120], [15, 45, 70], t); c = mix(c, [120, 170, 200], wave * (1 - t) * 0.6); }
    if (subject) { const [sx, sy] = subject, bw = 0.026, top = sy - 0.2; if (u > sx - bw && u < sx + bw && v > top && v < sy + 0.12) c = (Math.floor((v - top) * 40) % 2) ? [235, 235, 235] : [190, 40, 40]; if (u > sx - 0.04 && u < sx + 0.04 && v > top - 0.03 && v <= top) c = [30, 30, 30]; }
    const n = (hash(Math.floor(u0 * w), Math.floor(v0 * h)) - 0.5) * 6; return [c[0] + n, c[1] + n, c[2] + n];
  });
}

/** A road running to a vanishing point: strong converging lines. */
export function road({ w = 480, h = 320, vp = [0.5, 0.42], seed = 5 } = {}) {
  return render(w, h, (u, v) => {
    if (v < vp[1]) { const c = mix([110, 160, 220], [230, 225, 215], v / vp[1]); return [c[0], c[1], c[2]]; }
    const t = (v - vp[1]) / (1 - vp[1]), half = 0.02 + t * 0.55, off = Math.abs(u - vp[0]);
    if (off < half) { const dash = off < half * 0.04 && Math.floor(Math.pow(t, 0.6) * 22) % 2 === 0; return dash ? [240, 220, 90] : [70 + 10 * noise2(u, v, 40, seed), 72, 78]; }
    if (off < half + 0.012 + t * 0.02) return [235, 235, 235];
    const g = 90 + 50 * fbm(u, v, seed); return [60, g, 50];
  });
}

/** Mirror-symmetric temple front. */
export function symmetric({ w = 420, h = 420 } = {}) {
  return render(w, h, (u, v) => {
    const x = Math.abs(u - 0.5);
    if (v < 0.3) return mix([190, 215, 245], [235, 238, 240], v / 0.3);
    if (v > 0.86) return [150, 140, 125];
    let c = [205, 190, 160]; if (x < 0.05 && v > 0.52) c = [40, 30, 25];
    if (Math.abs(x - 0.18) < 0.03 || Math.abs(x - 0.33) < 0.03) c = [245, 238, 220];
    if (v < 0.4 && x < 0.4 - (0.4 - v) * 1.5) c = [170, 80, 60]; return c;
  });
}

/** One small subject in a big empty space (minimalism). */
export function minimal({ w = 480, h = 320, at = [0.667, 0.667], size = 0.045 } = {}) {
  return render(w, h, (u, v) => {
    const bg = mix([232, 236, 240], [220, 226, 232], v); if (disc(u, v, at[0], at[1], size, w / h)) return [200, 50, 40]; return bg;
  });
}

/** Black figures against a blazing sky. */
export function silhouette({ w = 480, h = 320 } = {}) {
  return render(w, h, (u, v) => {
    const sky = mix([255, 190, 80], [120, 50, 90], v * 1.2); const sun = Math.hypot((u - 0.7) * (w / h), v - 0.55);
    let c = sun < 0.07 ? [255, 245, 210] : sky; if (v > 0.8) c = [18, 14, 20];
    if (Math.abs(u - 0.32) < 0.012 && v > 0.36 && v < 0.82) c = [8, 8, 10]; if (disc(u, v, 0.32, 0.34, 0.03, w / h)) c = [8, 8, 10];
    if (v > 0.5 && v < 0.82 && Math.hypot((u - 0.3) * 2, v - 0.55) < 0.14 && u < 0.4) c = mix(c, [8, 8, 10], 0.9); return c;
  });
}

/** A bright view seen through a dark arch: frame within a frame. */
export function archway({ w = 480, h = 320 } = {}) {
  return render(w, h, (u, v) => {
    const x = (u - 0.5) * (w / h), y = v - 0.52, inside = Math.abs(x) < 0.5 && y > -0.34 && (y < 0.5) && (Math.hypot(x, Math.min(0, y + 0.1)) < 0.42);
    if (!inside) return [24 + 10 * noise2(u, v, 30, 4), 20, 18];
    const c = mix([120, 180, 230], [240, 210, 160], v); if (disc(u, v, 0.55, 0.62, 0.05, w / h)) return [200, 60, 50]; return c;
  });
}

/** Repeating windows. */
export function pattern({ w = 480, h = 320, cols = 8 } = {}) {
  return render(w, h, (u, v) => { const cu = (u * cols) % 1, cv = (v * 5) % 1, win = cu > 0.22 && cu < 0.78 && cv > 0.18 && cv < 0.82; return win ? [70, 100 + 40 * (Math.floor(u * cols) % 2), 150] : [205, 195, 175]; });
}

/** A dark, moody still life. */
export function lowKey({ w = 480, h = 320 } = {}) {
  return render(w, h, (u, v) => { const d = Math.hypot((u - 0.35) * 1.5, v - 0.45); const l = Math.max(0, 1 - d * 2.4); return [14 + 190 * l * l, 12 + 150 * l * l, 10 + 90 * l * l]; });
}

/** Add Gaussian-ish noise (sigma in levels) to an image. */
export function addNoise(img, sigma, seed = 1) {
  const r = rng(seed), out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) { const n = (r() + r() + r() + r() - 2) * sigma * 1.73; out[i] += n; out[i + 1] += n; out[i + 2] += n; }
  return { w: img.w, h: img.h, data: out };
}

/** Separable box blur applied to RGB, as a stand-in for a soft or shaken photo. */
export function blurImg(img, r) {
  const { w, h } = img, out = new Uint8ClampedArray(img.data.length), tmp = new Float32Array(img.data.length), d = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let k = -r; k <= r; k++) s += img.data[(y * w + Math.min(w - 1, Math.max(0, x + k))) * 4 + c]; tmp[(y * w + x) * 4 + c] = s / d; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 4 + c]; out[(y * w + x) * 4 + c] = s / d; out[(y * w + x) * 4 + 3] = 255; }
  return { w, h, data: out };
}

/** Multiply channels (e.g. [1.3, 1, 0.75] for a warm cast) and brightness. */
export function grade(img, [r, g, b], gain = 1) {
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) { out[i] *= r * gain; out[i + 1] *= g * gain; out[i + 2] *= b * gain; }
  return { w: img.w, h: img.h, data: out };
}

export const SAMPLES = [
  { id: 'harbour', name: 'Tilted seaside', make: (w = 480, h = 320) => landscape({ w, h, angle: 4 }), goal: 'landscape' },
  { id: 'road', name: 'Open road', make: (w = 480, h = 320) => road({ w, h }), goal: 'travel' },
  { id: 'temple', name: 'Symmetry', make: (w = 420, h = 420) => symmetric({ w, h }), goal: 'architecture' },
  { id: 'lone', name: 'Lone subject', make: (w = 480, h = 320) => minimal({ w, h }), goal: 'minimalism' },
  { id: 'dusk', name: 'Dusk silhouette', make: (w = 480, h = 320) => silhouette({ w, h }), goal: 'silhouette' },
  { id: 'arch', name: 'Through the arch', make: (w = 480, h = 320) => archway({ w, h }), goal: 'street' },
];
