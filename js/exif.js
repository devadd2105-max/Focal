// Minimal, dependency-free EXIF reader for JPEG files. It runs in the browser,
// so the photo never has to leave the page. Only the tags Focal uses are read.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readValue(dv, tiff, le, type, count, valOff) {
  const size = (TYPE_SIZE[type] || 1) * count, base = size <= 4 ? valOff : tiff + dv.getUint32(valOff, le);
  if (base + size > dv.byteLength) return null;
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = base + i * (TYPE_SIZE[type] || 1);
    switch (type) {
      case 1: case 7: out.push(dv.getUint8(p)); break;
      case 2: out.push(dv.getUint8(p)); break;
      case 3: out.push(dv.getUint16(p, le)); break;
      case 4: out.push(dv.getUint32(p, le)); break;
      case 9: out.push(dv.getInt32(p, le)); break;
      case 5: { const d = dv.getUint32(p + 4, le); out.push(d ? dv.getUint32(p, le) / d : 0); break; }
      case 10: { const d = dv.getInt32(p + 4, le); out.push(d ? dv.getInt32(p, le) / d : 0); break; }
      default: return null;
    }
  }
  if (type === 2) { let s = ''; for (const c of out) { if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
  return count === 1 ? out[0] : out;
}

function readIfd(dv, tiff, le, off, into) {
  if (off + 2 > dv.byteLength) return;
  const n = dv.getUint16(off, le);
  for (let i = 0; i < n; i++) {
    const e = off + 2 + i * 12; if (e + 12 > dv.byteLength) break;
    const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
    if (count > 4096) continue;
    const v = readValue(dv, tiff, le, type, count, e + 8);
    if (v !== null && v !== undefined) into[tag] = v;
  }
}

/** Returns normalised camera settings, or null if the file has no EXIF block. */
export function parseExif(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (dv.byteLength < 12 || dv.getUint16(0) !== 0xFFD8) return null;
  let p = 2;
  while (p + 4 < dv.byteLength) {
    if (dv.getUint8(p) !== 0xFF) break;
    const marker = dv.getUint8(p + 1), len = dv.getUint16(p + 2);
    if (marker === 0xDA) break;
    if (marker === 0xE1 && dv.getUint32(p + 4) === 0x45786966 && dv.getUint16(p + 8) === 0) {
      const tiff = p + 10, le = dv.getUint16(tiff) === 0x4949;
      if (dv.getUint16(tiff + 2, le) !== 42) return null;
      const t0 = {}, t1 = {};
      const ifd0 = tiff + dv.getUint32(tiff + 4, le);
      readIfd(dv, tiff, le, ifd0, t0);
      if (t0[0x8769] !== undefined) readIfd(dv, tiff, le, tiff + t0[0x8769], t1);
      return normalise(t0, t1);
    }
    p += 2 + len;
  }
  return null;
}

const PROGRAMS = ['unknown', 'manual', 'program', 'aperture priority', 'shutter priority', 'creative', 'action', 'portrait', 'landscape'];

function normalise(a, b) {
  const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
  const flash = b[0x9209];
  const out = {
    source: 'exif',
    camera: [a[0x010F], a[0x0110]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null,
    lens: b[0xA434] || null,
    shutter: num(b[0x829A]),
    aperture: num(b[0x829D]),
    iso: num(Array.isArray(b[0x8827]) ? b[0x8827][0] : b[0x8827]),
    focal: num(b[0x920A]),
    focal35: num(b[0xA405]),
    ev: typeof b[0x9204] === 'number' ? b[0x9204] : null,
    wb: b[0xA403] === 0 ? 'auto' : b[0xA403] === 1 ? 'manual' : null,
    flash: typeof flash === 'number' ? !!(flash & 1) : null,
    program: PROGRAMS[b[0x8822]] || null,
    orientation: a[0x0112] || 1,
    date: b[0x9003] || null,
  };
  const found = ['shutter', 'aperture', 'iso', 'focal', 'ev', 'wb', 'flash'].filter((k) => out[k] !== null).length;
  return found || out.camera ? out : null;
}

export function formatShutter(s) {
  if (!s) return '–';
  return s >= 0.4 ? `${+s.toFixed(1)} s` : `1/${Math.round(1 / s)} s`;
}
