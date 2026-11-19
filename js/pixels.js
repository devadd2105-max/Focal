// Small pixel toolbox. Every image is { w, h, data } where data is RGBA bytes,
// so the same code runs in the browser (canvas ImageData) and in node tests.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Rec. 709 luma of every pixel, 0..255, as a Float32Array. */
export function luma(img) {
  const { w, h, data } = img, out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
  return out;
}

/** Box-filter downscale so the longest side is at most maxSide. Never upsizes. */
export function downscale(img, maxSide) {
  const { w, h, data } = img, k = Math.max(w, h) / maxSide;
  if (k <= 1) return img;
  const nw = Math.max(1, Math.round(w / k)), nh = Math.max(1, Math.round(h / k));
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const j = (yy * w + xx) * 4; r += data[j]; g += data[j + 1]; b += data[j + 2]; n++; }
      const o = (y * nw + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { w: nw, h: nh, data: out };
}

export function cropImg(img, x, y, cw, ch) {
  x = Math.round(clamp(x, 0, img.w - 1)); y = Math.round(clamp(y, 0, img.h - 1));
  cw = Math.round(clamp(cw, 1, img.w - x)); ch = Math.round(clamp(ch, 1, img.h - y));
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let yy = 0; yy < ch; yy++) out.set(img.data.subarray(((y + yy) * img.w + x) * 4, ((y + yy) * img.w + x + cw) * 4), yy * cw * 4);
  return { w: cw, h: ch, data: out };
}

/** Separable box blur on a gray plane (radius r). */
export function boxBlur(src, w, h, r) {
  if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = s / d; s += src[row + clamp(x + r + 1, 0, w - 1)] - src[row + clamp(x - r, 0, w - 1)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / d; s += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x]; }
  }
  return out;
}

/** Sobel gradients on a gray plane. Returns gx, gy and magnitude. */
export function sobel(g, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1], d = g[i - 1], f = g[i + 1], p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
    const sx = (c + 2 * f + r) - (a + 2 * d + p), sy = (p + 2 * q + r) - (a + 2 * b + c);
    gx[i] = sx; gy[i] = sy; mag[i] = Math.hypot(sx, sy);
  }
  return { gx, gy, mag };
}

export function percentile(arr, p) {
  const a = Float32Array.from(arr).sort(); return a[clamp(Math.floor(p * (a.length - 1)), 0, a.length - 1)];
}

/** Connected components of a boolean mask (4-neighbour). */
export function components(mask, w, h) {
  const lab = new Int32Array(w * h), out = []; let n = 0; const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    n++; lab[s] = n; stack.push(s);
    let area = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[i - 1] && !lab[i - 1]) { lab[i - 1] = n; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !lab[i + 1]) { lab[i + 1] = n; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && !lab[i - w]) { lab[i - w] = n; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && !lab[i + w]) { lab[i + w] = n; stack.push(i + w); }
    }
    out.push({ id: n, area, cx: sx / area, cy: sy / area, x0, y0, x1, y1 });
  }
  return { labels: lab, comps: out };
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0;
  if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return [hh, mx ? d / mx : 0, mx];
}
