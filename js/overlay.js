// Draws the coach's marks on top of the photo. Everything is in 0..1 image coordinates.
const CYAN = '#5fd4c4', AMBER = '#ffb84a', RED = '#ff6b7d', BLUE = '#7aa2ff';

function maskCanvas(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), d = x.createImageData(w, h); paint(d.data); x.putImageData(d, 0, 0); return c;
}

/** Clip mask: highlights red, shadows blue, from a small RGBA copy of the photo. */
export function zebraCanvas(work) {
  const { w, h, data } = work;
  return maskCanvas(w, h, (o) => {
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      const L = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
      if (L >= 250) { o[j] = 255; o[j + 1] = 60; o[j + 2] = 90; o[j + 3] = (Math.floor(i / w) + (i % w)) % 6 < 3 ? 210 : 70; }
      else if (L <= 5) { o[j] = 90; o[j + 1] = 130; o[j + 2] = 255; o[j + 3] = (Math.floor(i / w) + (i % w)) % 6 < 3 ? 210 : 70; }
    }
  });
}
export function focusCanvas(m) {
  const { w, h, mask } = m.focus;
  return maskCanvas(w, h, (o) => { for (let i = 0; i < mask.length; i++) if (mask[i]) { const j = i * 4; o[j] = 95; o[j + 1] = 212; o[j + 2] = 196; o[j + 3] = 235; } });
}

function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
function tag(g, text, x, y, color, W, H) {
  g.font = '700 13px ui-sans-serif, system-ui, sans-serif';
  const pad = 6, tw = g.measureText(text).width + pad * 2, th = 22;
  const bx = Math.max(4, Math.min(W - tw - 4, x)), by = Math.max(4, Math.min(H - th - 4, y));
  g.fillStyle = 'rgba(16,17,19,.88)'; g.beginPath(); g.roundRect ? g.roundRect(bx, by, tw, th, 6) : g.rect(bx, by, tw, th); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, bx + pad, by + th / 2 + 0.5);
}

/**
 * state: { grid, subject, lines, horizon, focus, zebra, space, crop }
 * assets: { zebra, focus } cached canvases
 */
export function draw(canvas, m, ev, state, assets) {
  const cssW = canvas.clientWidth || canvas.width, cssH = canvas.clientHeight || canvas.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cssW, cssH);
  const W = cssW, H = cssH, X = (v) => v * W, Y = (v) => v * H;
  g.lineCap = 'round'; g.lineJoin = 'round';

  if (state.space && m.space.largest > 0.03) {
    const s = m.space; g.fillStyle = 'rgba(157,184,255,.18)'; g.strokeStyle = BLUE; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.fillRect(X(s.x0), Y(s.y0), X(s.x1 - s.x0), Y(s.y1 - s.y0)); g.strokeRect(X(s.x0), Y(s.y0), X(s.x1 - s.x0), Y(s.y1 - s.y0)); g.setLineDash([]);
    tag(g, `Empty space ${Math.round(s.largest * 100)}%`, X(s.x0) + 6, Y(s.y0) + 6, BLUE, W, H);
  }
  if (state.zebra && assets.zebra) { g.imageSmoothingEnabled = false; g.drawImage(assets.zebra, 0, 0, W, H); g.imageSmoothingEnabled = true; }
  if (state.focus && assets.focus) { g.imageSmoothingEnabled = false; g.drawImage(assets.focus, 0, 0, W, H); g.imageSmoothingEnabled = true; }

  const grid = state.grid;
  if (grid && grid !== 'off') {
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.72)'; g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 2;
    const cuts = grid === 'thirds' ? [1 / 3, 2 / 3] : grid === 'golden' ? [0.382, 0.618] : [];
    for (const c of cuts) { line(g, X(c), 0, X(c), H); line(g, 0, Y(c), W, Y(c)); }
    if (grid === 'diagonals') { line(g, 0, 0, W, H); line(g, W, 0, 0, H); }
    if (grid === 'axis') { g.setLineDash([8, 6]); line(g, X(0.5), 0, X(0.5), H); g.setLineDash([]); }
    if (cuts.length) { g.fillStyle = CYAN; g.shadowBlur = 0; for (const a of cuts) for (const b of cuts) { g.beginPath(); g.arc(X(a), Y(b), 4.5, 0, 7); g.fill(); } }
    g.shadowBlur = 0;
  }
  if (state.lines) {
    g.lineWidth = 2.5; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3;
    m.lines.list.slice(0, 8).forEach((l, i) => { g.strokeStyle = i < 3 ? AMBER : 'rgba(255,184,74,.55)'; line(g, X(l.x0), Y(l.y0), X(l.x1), Y(l.y1)); });
    const vp = m.lines.vanishing;
    if (vp) { g.shadowBlur = 0; g.strokeStyle = RED; g.lineWidth = 2.5; const x = Math.max(10, Math.min(W - 10, X(vp.x))), y = Math.max(10, Math.min(H - 10, Y(vp.y))); g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); line(g, x - 15, y, x + 15, y); line(g, x, y - 15, x, y + 15); tag(g, 'Vanishing point', x + 14, y - 11, RED, W, H); }
    g.shadowBlur = 0;
  }
  if (state.horizon && m.lines.horizon) {
    const hz = m.lines.horizon, a = hz.angle, ok = Math.abs(a) < 0.6;
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3; g.lineWidth = 3; g.strokeStyle = ok ? CYAN : AMBER; line(g, X(hz.x0), Y(hz.y0), X(hz.x1), Y(hz.y1));
    if (!ok) { const my = (hz.y0 + hz.y1) / 2; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.setLineDash([6, 6]); line(g, 0, Y(my), W, Y(my)); g.setLineDash([]); }
    g.shadowBlur = 0; tag(g, ok ? 'Level' : `${Math.abs(a).toFixed(1)}° ${a > 0 ? 'clockwise' : 'anticlockwise'}`, X(hz.x0) + 8, Y(Math.min(hz.y0, hz.y1)) - 30, ok ? CYAN : AMBER, W, H);
  }
  if (state.subject && m.subject) {
    const s = m.subject; g.shadowBlur = 0; g.lineWidth = 2.5; g.strokeStyle = CYAN; g.setLineDash([]);
    const x = X(s.x0), y = Y(s.y0), w = X(s.x1 - s.x0), h = Y(s.y1 - s.y0), c = Math.min(18, w / 3, h / 3);
    for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { g.beginPath(); g.moveTo(px + dx * c, py); g.lineTo(px, py); g.lineTo(px, py + dy * c); g.stroke(); }
    g.fillStyle = CYAN; g.beginPath(); g.arc(X(s.cx), Y(s.cy), 4, 0, 7); g.fill();
    tag(g, 'Main subject (estimate)', x, y - 28, CYAN, W, H);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(95,212,196,.55)'; g.setLineDash([4, 4]);
    for (const b of m.blobs.slice(1, 4)) g.strokeRect(X(b.x0), Y(b.y0), X(b.x1 - b.x0), Y(b.y1 - b.y0)); g.setLineDash([]);
  }
  if (state.crop) {
    const r = state.crop; g.fillStyle = 'rgba(12,13,15,.62)';
    g.fillRect(0, 0, W, Y(r.y)); g.fillRect(0, Y(r.y + r.h), W, H - Y(r.y + r.h)); g.fillRect(0, Y(r.y), X(r.x), Y(r.h)); g.fillRect(X(r.x + r.w), Y(r.y), W - X(r.x + r.w), Y(r.h));
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(X(r.x), Y(r.y), X(r.w), Y(r.h));
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.5)';
    for (const c of [1 / 3, 2 / 3]) { line(g, X(r.x + r.w * c), Y(r.y), X(r.x + r.w * c), Y(r.y + r.h)); line(g, X(r.x), Y(r.y + r.h * c), X(r.x + r.w), Y(r.y + r.h * c)); }
  }
}

/** Histogram with shaded clipping zones. */
export function drawHist(canvas, L) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = canvas.clientWidth || 240, H = canvas.clientHeight || 72;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const bins = L.hist, max = Math.max(...bins.map((v) => Math.sqrt(v))) || 1, bw = W / bins.length;
  g.fillStyle = 'rgba(255,107,125,.16)'; g.fillRect(W - bw * 2, 0, bw * 2, H); g.fillStyle = 'rgba(122,162,255,.18)'; g.fillRect(0, 0, bw * 2, H);
  g.fillStyle = '#d8dde4';
  bins.forEach((v, i) => { const h = (Math.sqrt(v) / max) * (H - 4); g.fillRect(i * bw, H - h, Math.max(1, bw - 0.6), h); });
  const mid = ((Math.pow(0.18, 1 / 2.2)) * 255) / 255; g.strokeStyle = 'rgba(95,212,196,.9)'; g.lineWidth = 1.2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(W * mid, 0); g.lineTo(W * mid, H); g.stroke(); g.setLineDash([]);
  if (L.clipHi > 0.01) { g.fillStyle = '#ff6b7d'; g.fillRect(W - 4, 0, 4, 4); }
  if (L.clipLo > 0.04) { g.fillStyle = '#7aa2ff'; g.fillRect(0, 0, 4, 4); }
}
