// Focal: wires the page to the analysis engine. Everything runs in the browser; nothing is uploaded.
import { analyze } from './analyze.js';
import { evaluate, GROUP_LABEL } from './checks.js';
import { playbookHtml, eyeCard, workingCard, histogramCard } from './guide.js';
import { parseExif, formatShutter } from './exif.js';
import { GOALS, GOAL_BY_ID, parseIntent, suggestGoal } from './intent.js';
import { describeSettings, settingsFromForm, SETTINGS_IDS } from './settings.js';
import { suggestCrops, straightenSize } from './crops.js';
import { SAMPLES } from './scenes.js';
import { draw, drawHist, zebraCanvas, focusCanvas } from './overlay.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_BYTES = 60 * 1024 * 1024, KEEP_SIDE = 3000, ANALYSE_SIDE = 1600;

const S = {
  orig: null,       // { canvas, url, settings, name }
  cur: null,        // working copy { canvas, url }  (differs from orig after straighten or crop)
  settings: null,   // EXIF settings or form settings
  settingsSource: 'none',
  picked: new Set(), text: '',
  m: null, ev: null, assets: {},
  ov: { grid: 'off', subject: false, lines: false, horizon: false, focus: false, zebra: false, space: false, crop: null },
  crops: [], token: 0,
};

/* ----------------------------------------------------------- notices */
function notice(msg) { const n = $('notice'); n.textContent = msg || ''; n.hidden = !msg; }
function busy(on) { $('busy').hidden = !on; }

/* ------------------------------------------------------------- intent */
function buildChips() {
  $('chips').innerHTML = GOALS.map((g) => `<button type="button" class="chip" data-goal="${g.id}" aria-pressed="false" title="${esc(g.blurb)}">${esc(g.label)}</button>`).join('');
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const id = b.dataset.goal; S.picked.has(id) ? S.picked.delete(id) : S.picked.add(id);
    b.setAttribute('aria-pressed', S.picked.has(id)); intentChanged();
  });
  let t; $('intent').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.text = $('intent').value; intentChanged(); }, 250); });
}
function currentGoals() { return parseIntent(S.text, [...S.picked]); }
function intentChanged() {
  const p = currentGoals(), r = $('read');
  r.classList.toggle('warn', p.unknown);
  if (p.matched.length) r.innerHTML = `Judging it as: <b>${p.matched.map((x) => esc(x.label)).join(', ')}</b>`;
  else if (p.unknown) r.textContent = 'No goal recognised yet. Try words like portrait, landscape, street, silhouette, minimal or night, or pick a chip.';
  else r.textContent = '';
  if (S.m) refresh();
}

/* ---------------------------------------------------------- loading */
function canvasFrom(src, maxSide) {
  const w0 = src.width, h0 = src.height, k = Math.min(1, maxSide / Math.max(w0, h0)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height); return c;
}
const toUrl = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error('encode'))), 'image/jpeg', 0.92));
function rgbaOf(canvas) { const c = canvasFrom(canvas, ANALYSE_SIDE), d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, data: d.data }; }

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

async function loadFile(file) {
  if (!file) return;
  notice('');
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name)) return notice('That does not look like a picture. Choose a JPEG, PNG or WebP file.');
  if (file.size > MAX_BYTES) return notice('That file is over 60 MB. Export a smaller copy and try again.');
  const token = ++S.token; busy(true); $('empty').hidden = true;
  try {
    const [bmp, exifBuf] = await Promise.all([decode(file), /jpe?g/i.test(file.type + file.name) ? file.slice(0, 262144).arrayBuffer() : null]);
    if (token !== S.token) return;
    const settings = exifBuf ? safe(() => parseExif(exifBuf)) : null;
    await start(canvasFrom(bmp, KEEP_SIDE), settings, file.name);
  } catch (e) {
    console.error(e); busy(false); $('empty').hidden = !!S.m; notice('Focal could not open that file. Export it as a JPEG or PNG and try again.');
  }
}
const safe = (fn) => { try { return fn(); } catch { return null; } };

async function start(canvas, settings, name) {
  const token = S.token;
  if (S.orig) URL.revokeObjectURL(S.orig.url); if (S.cur && S.cur !== S.orig) URL.revokeObjectURL(S.cur.url);
  const url = await toUrl(canvas);
  S.orig = { canvas, url, settings, name }; S.cur = S.orig;
  S.settings = settings; S.settingsSource = settings ? 'exif' : 'none';
  S.ov = { ...S.ov, crop: null };
  await analyseCurrent(token, true);
}

async function analyseCurrent(token, fresh) {
  busy(true);
  await new Promise((r) => setTimeout(r, 30));
  const photo = $('photo');
  photo.src = S.cur.url; await photo.decode().catch(() => {});
  if (token !== S.token) return;
  S.m = analyze(rgbaOf(S.cur.canvas));
  S.assets = {};
  if (fresh) for (const k of ['subject', 'lines', 'horizon', 'focus', 'zebra', 'space']) S.ov[k] = false;
  busy(false); $('result').hidden = false; enterWorkspace();
  refresh(true);
  if (fresh) $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/* ---------------------------------------------------------- render */
function refresh(first) {
  const goals = currentGoals().goals;
  S.ev = evaluate(S.m, { goals, settings: S.settings });
  S.crops = suggestCrops(S.m); S.sugg = suggestGoal(S.m);
  renderScore(); renderFirst(); renderPanels(); renderLcd(); syncTools();
  drawHist($('hist'), S.m.light); redraw();
  if (first) selectTab('overview', false);
}

const band = (v) => (v >= 75 ? 'var(--good)' : v >= 55 ? 'var(--warn)' : 'var(--bad)');
function verdict(v) { return v >= 82 ? 'Strong picture' : v >= 70 ? 'Good, with a few fixes' : v >= 50 ? 'Needs some work' : 'Needs a rethink'; }

function renderScore() {
  const r = S.ev; $('big').textContent = r.overall; $('big').style.setProperty('--c', band(r.overall)); $('verdict').textContent = verdict(r.overall);
  $('bars').innerHTML = Object.entries(r.scores).map(([g, v]) => `<div class="bar"><b>${GROUP_LABEL[g]}</b><span class="track"><span class="fill" style="width:${v}%;--c:${band(v)}"></span></span><em>${v}</em></div>`).join('');
  const gl = $('goalline'), p = currentGoals();
  if (r.goalMatch != null) { gl.hidden = false; gl.innerHTML = `<b>Fit for your goal: ${r.goalMatch}/100.</b> Judged as ${p.matched.map((x) => esc(x.label)).join(', ')}.${r.intents.length ? ` ${r.intents.length} thing${r.intents.length > 1 ? 's' : ''} that would normally count against it ${r.intents.length > 1 ? 'are' : 'is'} marked as deliberate.` : ''}`; }
  else if (S.sugg && !S.picked.size && !S.text.trim() && GOAL_BY_ID[S.sugg.id]) {
    const g = GOAL_BY_ID[S.sugg.id]; gl.hidden = false;
    gl.innerHTML = `<b>This could be ${/^[aeiou]/i.test(g.label) ? 'an' : 'a'} ${esc(g.label.toLowerCase())} picture</b> (${esc(S.sugg.why)}). It is only a guess. <button type="button" class="chip" id="acceptsugg">Judge it as ${esc(g.label.toLowerCase())}</button>`;
    $('acceptsugg').addEventListener('click', () => { S.picked.add(g.id); document.querySelectorAll('.chip[data-goal]').forEach((x) => x.setAttribute('aria-pressed', S.picked.has(x.dataset.goal))); intentChanged(); });
  } else gl.hidden = true;
  requestAnimationFrame(() => document.querySelectorAll('#bars .fill').forEach((f) => { f.style.width = f.style.width; }));
}

const OV_FOR = { zebra: 'zebra', focus: 'focus', horizon: 'horizon', lines: 'lines', subject: 'subject', space: 'space', grid: 'grid' };
function showBtn(f) { return OV_FOR[f.overlay] ? `<button type="button" class="btn ghost small" data-show="${OV_FOR[f.overlay]}">Show on photo</button>` : ''; }

function renderFirst() {
  const list = S.ev.fixFirst, el = $('first');
  if (!list.length) { el.innerHTML = `<h2>Fix first</h2><p class="none">Nothing big stands out. Check the tabs for finer points.</p>`; return; }
  el.innerHTML = `<h2>Fix first</h2><ol>${list.map((f) => `<li><div><b>${esc(f.title)}</b><p>${esc(f.fix || f.summary)}</p></div>${showBtn(f)}</li>`).join('')}</ol>`;
}

function card(f) {
  const cls = f.state === 'good' ? 'good' : f.state === 'intent' ? 'intent' : f.state === 'info' ? 'info' : f.severity >= 0.6 ? 'sev-hi' : 'sev-lo';
  const conf = f.confidence === 'estimated' ? '<span class="tag est" title="A rule of thumb that can be wrong">estimate</span>' : '<span class="tag ok" title="Read straight from the pixels">measured</span>';
  const st = f.state === 'intent' ? '<span class="tag intent">deliberate</span>' : '';
  const note = f.state === 'intent' ? `<p class="intent-note">Counted as deliberate for ${esc(f.intent.goal)}: ${esc(f.intent.text)}</p>` : '';
  const more = f.why || f.fix ? `<details><summary>Why and what to do</summary>${f.why ? `<p>${esc(f.why)}</p>` : ''}${f.fix ? `<p><b>Try:</b> ${esc(f.fix)}</p>` : ''}</details>` : '';
  const act = showBtn(f) ? `<div class="act">${showBtn(f)}</div>` : '';
  return `<article class="f ${cls}"><div class="f-head"><h4>${esc(f.title)}</h4>${f.measure ? `<span class="tag">${esc(f.measure)}</span>` : ''}${conf}${st}</div><p>${esc(f.summary)}</p>${note}${more}${act}</article>`;
}
const order = (a, b) => ({ issue: 0, intent: 1, info: 2, good: 3 }[a.state] - { issue: 0, intent: 1, info: 2, good: 3 }[b.state]) || b.effective * b.weight - a.effective * a.weight;
const cards = (fs) => fs.length ? fs.sort(order).map(card).join('') : '';

function meterSvg(ev) {
  const lo = -4, hi = 4, x = (v) => 20 + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 460, good = ev > -1.3 && ev < 1.1;
  return `<svg viewBox="0 0 500 74" role="img" aria-label="Exposure ${ev.toFixed(1)} stops from middle grey"><rect x="20" y="22" width="460" height="14" rx="7" fill="#1b1d20"/><rect x="${x(-1.3)}" y="22" width="${x(1.1) - x(-1.3)}" height="14" fill="#4f9bff55"/><line x1="${x(0)}" y1="16" x2="${x(0)}" y2="42" stroke="#4f9bff" stroke-width="2"/><circle cx="${x(ev)}" cy="29" r="9" fill="${good ? '#4f9bff' : '#ffb84a'}" stroke="#141518" stroke-width="3"/><g fill="#aab0ba" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle"><text x="20" y="62">-4 EV</text><text x="${x(0)}" y="62">middle grey</text><text x="480" y="62">+4 EV</text></g></svg>`;
}

function renderPanels() {
  const r = S.ev, m = S.m, F = r.findings, notSet = (f) => !SETTINGS_IDS.includes(f.id), group = (g) => F.filter((f) => f.group === g && notSet(f));
  const p = currentGoals();
  // overview
  const goalBits = r.goalMatch != null ? `<div class="setcard"><h4>Your goal</h4><p class="srcnote">Matched: ${p.matched.map((x) => esc(x.label)).join(', ')}.</p>${r.expected.length ? `<p class="srcnote">Techniques this goal usually uses:</p><ul class="chip-list">${r.expected.map((e) => `<li>${e.used ? '✓ ' : ''}${esc(e.label)}${e.used ? '' : ' (not found)'}</li>`).join('')}</ul>` : ''}${r.tips.length ? `<ul class="tips" style="margin-top:10px">${r.tips.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul>` : ''}</div>` : '';
  $('p-overview').innerHTML = `${workingCard(r)}${goalBits}${cards(F.filter((f) => notSet(f) && (f.state === 'issue' || f.state === 'intent')))}${F.some((f) => notSet(f) && f.state === 'issue') ? '' : '<p>No problems found in the measured checks.</p>'}<h3>Working well</h3>${cards(F.filter((f) => notSet(f) && f.state === 'good')) || '<p>Nothing stands out yet.</p>'}<h3>Not measured</h3><p>Focal cannot judge these, so a low score does not mean a bad photo:</p><ul class="chip-list">${r.notMeasured.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  // composition
  const pl = r.placement, fitRows = pl ? ['thirds', 'golden', 'centred', 'diagonals'].map((k) => `<div class="fit ${pl.best.id === k ? 'best' : ''}"><b>${{ thirds: 'Rule of thirds', golden: 'Golden ratio', centred: 'Centred', diagonals: 'Diagonal' }[k]}</b><span class="track"><span class="fill" style="width:${Math.round(pl.fits[k].fit * 100)}%"></span></span><em>${Math.round(pl.fits[k].fit * 100)}</em></div>`).join('') : '';
  $('p-comp').innerHTML = `${pl ? `<div class="setcard"><h4>Where the subject sits</h4><p class="srcnote">How closely the main subject matches each classic placement (100 is exact). Turn on Subject and a grid to see it.</p><div class="fits">${fitRows}</div></div>` : '<p>No clear main subject was found, so placement was not checked.</p>'}${cards(group('comp')) || '<p>No composition problems found.</p>'}`;
  // light and colour
  const c = m.colour;
  $('p-light').innerHTML = `<div class="setcard"><h4>Exposure</h4><div class="meter">${meterSvg(m.light.evMid)}</div></div>${histogramCard(r.histogram)}${cards([...group('light'), ...group('colour')])}${c.palette.length ? `<h3>Main colours</h3><div class="palette" role="img" aria-label="Main colours of the photo">${c.palette.map((q) => `<i style="background:${q.hex};flex:${Math.max(q.share, 0.02)}"></i>`).join('')}</div><p class="pal-l">${c.palette.map((q) => esc(q.hex)).join(' ')}</p><p>Colour scheme: ${esc(c.harmony)}. Average saturation ${Math.round(c.sat * 100)}%.</p>` : ''}`;
  // focus
  $('p-focus').innerHTML = `${cards(group('focus')) || '<p>No sharpness problems found.</p>'}<p>Turn on <b>Focus</b> over the photo to see the sharpest areas in cyan.</p>`;
  // settings
  renderSettings(F.filter((f) => SETTINGS_IDS.includes(f.id)));
  // crops
  renderCrops();
  // techniques
  const groups = {}; for (const t of r.techniques) (groups[t.group] ||= []).push(t);
  $('p-tech').innerHTML = `${eyeCard()}<p>${r.techniques.filter((t) => t.used).length} of ${r.techniques.length} techniques found. Estimates are marked.</p>` + Object.entries(groups).map(([g, ts]) => `<div class="tgroup"><h3>${esc(g)}</h3>${ts.map((t) => `<details class="tech ${t.used ? 'used' : ''}"><summary><span class="mk" aria-hidden="true">${t.used ? '✓' : ''}</span><span>${esc(t.label)}<span class="visually-hidden">${t.used ? ' (found)' : ' (not found)'}</span></span><span class="tag ${t.confidence === 'estimated' ? 'est' : ''}">${t.confidence === 'estimated' ? 'estimate' : 'measured'}</span></summary><div class="body"><span>${esc(t.detail)}</span><span><b>How:</b> ${esc(t.how)}</span></div></details>`).join('')}</div>`).join('');
}

/* settings form */
const fmt = (v) => (v == null ? '' : String(v));
function renderSettings(findings) {
  const s = S.settings || {}, src = S.settingsSource;
  const note = src === 'exif' ? 'Read from the photo\'s EXIF data. Change any value and press Check to try other numbers.' : src === 'form' ? 'Using the values you typed.' : 'No camera data was found in this file. Photos sent through chat apps, screenshots and edited copies usually lose it. Type the settings from memory to get advice on the exposure triangle.';
  const shut = s.shutter ? (s.shutter < 1 ? `1/${Math.round(1 / s.shutter)}` : String(s.shutter)) : '';
  const sel = (v, opts) => opts.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
  const meta = src === 'exif' ? describeSettings(S.settings).filter(([k]) => ['Camera', 'Lens'].includes(k)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ') : '';
  $('p-set').innerHTML = `<div class="setcard"><h4>Camera settings</h4><p class="srcnote">${esc(note)}</p>${meta ? `<p class="srcnote">${meta}</p>` : ''}<form id="setform" class="setform" autocomplete="off">
    <label>Aperture<input name="aperture" inputmode="decimal" placeholder="f/1.8" value="${esc(s.aperture ? `f/${+s.aperture.toFixed(1)}` : '')}"></label>
    <label>Shutter<input name="shutter" inputmode="text" placeholder="1/250" value="${esc(shut)}"></label>
    <label>ISO<input name="iso" inputmode="numeric" placeholder="100" value="${esc(fmt(s.iso))}"></label>
    <label>Focal length (mm)<input name="focal" inputmode="decimal" placeholder="24" value="${esc(s.focal ? Math.round(s.focal) : '')}"></label>
    <label>35 mm equivalent<input name="focal35" inputmode="decimal" placeholder="same as focal length" value="${esc(s.focal35 ? Math.round(s.focal35) : '')}"></label>
    <label>Exposure compensation<input name="ev" inputmode="decimal" placeholder="0" value="${esc(s.ev != null ? s.ev : '')}"></label>
    <label>White balance<select name="wb">${sel(s.wb || '', [['', 'Not sure'], ['auto', 'Auto'], ['manual', 'Manual or preset']])}</select></label>
    <label>Flash<select name="flash">${sel(s.flash == null ? '' : s.flash ? 'on' : 'off', [['', 'Not sure'], ['off', 'Did not fire'], ['on', 'Fired']])}</select></label>
    <div class="row wide" style="grid-column:1/-1"><button class="btn" type="submit">Check these settings</button><button class="btn ghost" type="button" id="setclear">Clear</button></div></form></div>
    ${cards(findings) || `<p>${S.settings ? 'No problems found with these settings.' : 'Enter at least an aperture, shutter speed or ISO to see advice.'}</p>`}${playbookHtml()}`;
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'setform') return; e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target).entries()); S.settings = settingsFromForm(f); S.settingsSource = S.settings ? 'form' : 'none';
  const keep = $('tabs').querySelector('[aria-selected="true"]').id; refresh(); selectTab(keep.slice(2), false);
});
document.addEventListener('click', (e) => {
  if (e.target.id === 'setclear') { S.settings = null; S.settingsSource = 'none'; refresh(); selectTab('set', false); }
});

/* crops */
function renderCrops() {
  const el = $('p-crops');
  if (!S.crops.length) { el.innerHTML = '<p>No crop clearly improves this photo. That is a good sign: the framing already works, or there is no single clear subject to build a crop around.</p>'; return; }
  el.innerHTML = `<p>Crops tested against placement, balance and what they would cut off. Preview shows the crop on your photo. Nothing is changed until you apply it.</p><div class="crops">${S.crops.map((c, i) => `<div class="crop"><canvas data-crop="${i}" aria-hidden="true"></canvas><div><h4>${esc(c.label)} <span class="gain">+${c.gain}</span></h4><p>This ${esc(c.why)}. Result: ${c.px.w} × ${c.px.h} px.</p></div><div class="act"><button type="button" class="btn ghost small" data-preview="${i}">Preview</button><button type="button" class="btn small" data-apply="${i}">Apply crop</button></div></div>`).join('')}</div>`;
  const img = $('photo');
  el.querySelectorAll('canvas[data-crop]').forEach((cv) => {
    const c = S.crops[+cv.dataset.crop].rect, nw = img.naturalWidth, nh = img.naturalHeight, tw = 224, th = Math.round(tw * (c.h * nh) / (c.w * nw));
    cv.width = tw; cv.height = Math.max(1, Math.min(224, th)); cv.getContext('2d').drawImage(img, c.x * nw, c.y * nh, c.w * nw, c.h * nh, 0, 0, cv.width, cv.height);
  });
}
document.addEventListener('click', (e) => {
  const pv = e.target.closest('[data-preview]'), ap = e.target.closest('[data-apply]');
  if (pv) { const i = +pv.dataset.preview, on = S.ov.crop !== S.crops[i].rect; S.ov.crop = on ? S.crops[i].rect : null; el_pv(on, pv); redraw(); $('frame').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  if (ap) applyCrop(S.crops[+ap.dataset.apply].rect);
});
function el_pv(on, btn) { document.querySelectorAll('[data-preview]').forEach((b) => (b.textContent = 'Preview')); if (on) btn.textContent = 'Hide preview'; }

/* --------------------------------------------------------- edits */
async function editTo(canvas) {
  const token = ++S.token, old = S.cur; S.ov.crop = null;
  const url = await toUrl(canvas); if (old !== S.orig) URL.revokeObjectURL(old.url);
  S.cur = { canvas, url }; await analyseCurrent(token, false);
}
function applyCrop(r) {
  const src = S.cur.canvas, w = Math.max(1, Math.round(r.w * src.width)), h = Math.max(1, Math.round(r.h * src.height)), c = document.createElement('canvas');
  c.width = w; c.height = h; c.getContext('2d').drawImage(src, Math.round(r.x * src.width), Math.round(r.y * src.height), w, h, 0, 0, w, h); editTo(c);
}
function straighten(deg) {
  const src = S.cur.canvas, { w, h } = straightenSize(src.width, src.height, deg), W = Math.max(1, Math.floor(w)), H = Math.max(1, Math.floor(h)), c = document.createElement('canvas');
  c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.translate(W / 2, H / 2); g.rotate(deg * Math.PI / 180); g.drawImage(src, -src.width / 2, -src.height / 2); editTo(c);
}
function restore() { const token = ++S.token; if (S.cur !== S.orig) URL.revokeObjectURL(S.cur.url); S.cur = S.orig; S.ov.crop = null; analyseCurrent(token, false); }
function save() {
  S.cur.canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `focal-${(S.orig.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/jpeg', 0.93);
}
$('straighten').addEventListener('click', () => { const f = S.ev.findings.find((x) => x.id === 'horizon' && x.rotate); if (f) straighten(f.rotate); });
$('restore').addEventListener('click', restore);

/* ------------------------------------------------- viewer controls */
function syncTools() {
  document.querySelectorAll('.tgl').forEach((b) => b.setAttribute('aria-pressed', !!S.ov[b.dataset.ov]));
  $('gridsel').value = S.ov.grid;
  const hf = S.ev.findings.find((x) => x.id === 'horizon' && x.state === 'issue' && x.rotate && Math.abs(x.rotate) >= 0.5 && Math.abs(x.rotate) <= 12 && !S.m.lines.horizon.converging);
  $('straighten').hidden = !hf; if (hf) $('straighten').textContent = `Straighten ${Math.abs(hf.rotate).toFixed(1)}°`;
  $('restore').hidden = S.cur === S.orig;
  let sv = $('savebtn'); if (!sv) { sv = document.createElement('button'); sv.id = 'savebtn'; sv.type = 'button'; sv.className = 'btn ghost'; sv.textContent = 'Save edited photo'; sv.addEventListener('click', save); $('restore').after(sv); }
  sv.hidden = S.cur === S.orig;
  document.querySelectorAll('[data-ov="horizon"]').forEach((b) => (b.disabled = !S.m.lines.horizon));
  document.querySelector('[data-ov="subject"]').disabled = !S.m.subject;
}
$('gridsel').addEventListener('change', (e) => { S.ov.grid = e.target.value; redraw(); });
document.querySelectorAll('.tgl').forEach((b) => b.addEventListener('click', () => { S.ov[b.dataset.ov] = !S.ov[b.dataset.ov]; syncTools(); redraw(); }));
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-show]'); if (!b) return;
  const k = b.dataset.show; if (k === 'grid') S.ov.grid = 'thirds'; else S.ov[k] = true;
  syncTools(); redraw(); $('frame').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

function enterWorkspace() {
  document.body.classList.add('has-photo');
  const intent = document.querySelector('section.intent'), rep = document.querySelector('.report');
  if (intent && rep && !intent.dataset.moved) {
    const d = document.createElement('details'); d.className = 'goalbox'; d.open = false;
    d.innerHTML = '<summary>Your goal</summary>'; intent.dataset.moved = '1'; d.append(intent); rep.append(d);
    rep.insertBefore(d, rep.querySelector('.tabs'));
  }
}
// Keyboard shortcuts, in the spirit of photo editors: G grid, J clipping, O subject, H horizon, F focus, E empty space, L lights out.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || !S.m) return;
  const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const k = e.key.toLowerCase(), map = { j: 'zebra', o: 'subject', h: 'horizon', f: 'focus', e: 'space', n: 'lines' };
  if (k === 'g') { const o = ['off', 'thirds', 'golden', 'diagonal']; const opts = [...$('gridsel').options].map((x) => x.value); const i = opts.indexOf(S.ov.grid); S.ov.grid = opts[(i + 1) % opts.length]; }
  else if (k === 'l') { document.body.classList.toggle('lights-out'); return; }
  else if (map[k]) { const b = document.querySelector(`[data-ov="${map[k]}"]`); if (b && b.disabled) return; S.ov[map[k]] = !S.ov[map[k]]; }
  else return;
  syncTools(); redraw();
});

function redraw() {
  if (!S.m) return; const cv = $('overlay');
  if (S.ov.zebra && !S.assets.zebra) S.assets.zebra = zebraCanvas(downWork());
  if (S.ov.focus && !S.assets.focus) S.assets.focus = focusCanvas(S.m);
  draw(cv, S.m, S.ev, S.ov, S.assets);
}
function downWork() { const c = canvasFrom(S.cur.canvas, 360), d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, data: d.data }; }
new ResizeObserver(() => redraw()).observe($('photo'));

function renderLcd() {
  const s = S.settings, rows = [];
  if (s) { if (s.aperture) rows.push(['Aperture', `f/${+s.aperture.toFixed(1)}`]); if (s.shutter) rows.push(['Shutter', formatShutter(s.shutter)]); if (s.iso) rows.push(['ISO', s.iso]); if (s.focal) rows.push(['Focal', `${Math.round(s.focal)} mm`]); }
  rows.push(['Size', `${S.cur.canvas.width}×${S.cur.canvas.height}`]);
  $('lcd').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + (s ? '' : '<div class="none">No camera data in this file</div>');
}

/* ------------------------------------------------------------ tabs */
const TABS = ['overview', 'comp', 'light', 'focus', 'set', 'crops', 'tech'];
function selectTab(id, focus = true) {
  for (const t of TABS) { const sel = t === id, b = $('t-' + t); b.setAttribute('aria-selected', sel); b.tabIndex = sel ? 0 : -1; $('p-' + t).hidden = !sel; }
  if (focus) $('t-' + id).focus();
  if (id === 'crops') renderCrops();
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) selectTab(b.id.slice(2), false); });
$('tabs').addEventListener('keydown', (e) => {
  const i = TABS.indexOf(document.activeElement.id.slice(2)); if (i < 0) return;
  const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key]; if (k === undefined) return;
  e.preventDefault(); selectTab(TABS[(k + TABS.length) % TABS.length]); $('t-' + TABS[(k + TABS.length) % TABS.length]).scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

/* ------------------------------------------------ input sources */
$('file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => window.addEventListener(t, (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
['dragleave', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (t === 'drop' || e.target === document.documentElement || !e.relatedTarget) drop.classList.remove('over'); }));
window.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); loadFile(f); } });
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); loadFile(f); } });
$('drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });

/* --------------------------------------------------------- samples */
function buildSamples() {
  $('samples').innerHTML = '';
  for (const s of SAMPLES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sample'; b.setAttribute('aria-label', `Try the sample: ${s.name}`);
    const cv = document.createElement('canvas'), im = s.make(240, 160); cv.width = im.w; cv.height = im.h;
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0);
    const sp = document.createElement('span'); sp.textContent = s.name; b.append(cv, sp);
    b.addEventListener('click', async () => {
      const im2 = s.make(), c = document.createElement('canvas'); c.width = im2.w; c.height = im2.h;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im2.data), im2.w, im2.h), 0, 0);
      if (!S.picked.size && !S.text.trim()) { S.picked.add(s.goal); document.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', S.picked.has(x.dataset.goal))); intentChanged(); }
      const token = ++S.token; $('empty').hidden = true; await start(c, null, `${s.id}.jpg`);
    });
    $('samples').append(b);
  }
}

buildChips(); buildSamples(); intentChanged();
window.__focal = S; // handy for debugging in the console
