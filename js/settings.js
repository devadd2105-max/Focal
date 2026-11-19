// Camera-settings advice: the exposure triangle (aperture, shutter, ISO), shake risk, white balance, flash.
// Settings come from the photo's EXIF block or from the form. The measurements from the pixels
// are used to check whether the settings actually produced a problem.
import { formatShutter } from './exif.js';

export const SETTINGS_IDS = ['shake', 'actionShutter', 'iso', 'aperture', 'wbmode', 'evcomp', 'flash', 'exposurePlan'];
const F_STOPS = [1, 1.2, 1.4, 1.8, 2, 2.8, 3.5, 4, 4.5, 5.6, 6.3, 8, 9, 11, 13, 16, 22];
const SHUTTERS = [1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30];
const ISOS = [50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200];
const near = (arr, v) => arr.reduce((b, x) => (Math.abs(Math.log2(x / v)) < Math.abs(Math.log2(b / v)) ? x : b), arr[0]);
const fmtF = (f) => `f/${+f.toFixed(1)}`;
const f1 = (v) => (Math.round(v * 10) / 10).toString();

export function describeSettings(s) {
  if (!s) return [];
  return [
    ['Camera', s.camera], ['Lens', s.lens], ['Aperture', s.aperture ? fmtF(s.aperture) : null], ['Shutter', s.shutter ? formatShutter(s.shutter) : null],
    ['ISO', s.iso], ['Focal length', s.focal ? `${Math.round(s.focal)} mm${s.focal35 && Math.round(s.focal35) !== Math.round(s.focal) ? ` (${Math.round(s.focal35)} mm equivalent)` : ''}` : null],
    ['Exposure compensation', s.ev != null ? `${s.ev > 0 ? '+' : ''}${f1(s.ev)} EV` : null], ['White balance', s.wb], ['Flash', s.flash == null ? null : s.flash ? 'fired' : 'off'], ['Mode', s.program],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
}

export function settingsFindings(m, s, goalIds, fs) {
  if (!s) return [];
  const out = [], eq = s.focal35 || s.focal, L = m.light, sigma = m.noise.shadow ?? m.noise.sigma;
  const soft = fs.state === 'blurry' || fs.state === 'soft';

  if (s.shutter && eq) {
    const ratio = s.shutter * eq, limit = 1 / eq, longest = formatShutter(near(SHUTTERS, limit));
    if (soft && ratio > 1.4) out.push({ id: 'shake', title: 'Likely camera shake', severity: ratio > 3 ? 0.9 : 0.65, measure: `${formatShutter(s.shutter)} at ${Math.round(eq)} mm`, summary: `The shutter was ${f1(ratio)}x slower than the 1/focal-length rule, and the picture is soft.`, why: 'Hand-held, the shutter should be at least 1 over the focal length (in 35 mm terms). Slower than that and tiny movements smear every edge.', fix: `Use ${longest} or faster, or brace on a wall or tripod, or turn on stabilisation. Raising ISO by ${Math.max(1, Math.ceil(Math.log2(ratio)))} stop${Math.ceil(Math.log2(ratio)) > 1 ? 's' : ''} buys the speed.`, confidence: 'estimated' });
    else if (!soft && ratio > 2.5) out.push({ id: 'shake', state: 'info', title: 'Slow shutter, but it came out sharp', summary: `${formatShutter(s.shutter)} at ${Math.round(eq)} mm is slower than the 1/focal-length rule, yet the photo is sharp. Stabilisation or a steady rest probably helped.`, measure: `${f1(ratio)}x the safe limit` });
    else if (soft && ratio <= 1) out.push({ id: 'shake', state: 'info', title: 'Shutter was fast enough', summary: `${formatShutter(s.shutter)} is fast enough for ${Math.round(eq)} mm, so the softness is more likely missed focus, a moving subject or a very shallow depth of field${s.aperture && s.aperture < 2.8 ? ` at ${fmtF(s.aperture)}` : ''}.`, measure: `${f1(ratio)}x the safe limit` });
    else out.push({ id: 'shake', state: 'good', title: 'Shutter speed', summary: `${formatShutter(s.shutter)} at ${Math.round(eq)} mm is within the 1/focal-length rule.`, measure: `${f1(ratio)}x the safe limit` });
  }
  if (s.shutter && goalIds.some((g) => ['action', 'nature'].includes(g)) && s.shutter > 1 / 250)
    out.push({ id: 'actionShutter', title: 'Shutter too slow for movement', severity: Math.min(1, Math.log2(s.shutter * 250) / 3), measure: formatShutter(s.shutter), summary: 'Moving subjects blur at this speed.', why: 'Walking people need about 1/250 s, running or flying subjects 1/1000 s or faster.', fix: `Try ${formatShutter(near(SHUTTERS, 1 / 1000))}. Open the aperture or raise ISO to make up the light.`, confidence: 'estimated' });
  if (s.iso) {
    const room = eq && s.shutter ? Math.log2((1 / eq) / s.shutter) : 0;
    if (sigma != null && sigma > 6 && s.iso >= 1600) out.push({ id: 'iso', title: 'High ISO is showing', severity: Math.min(1, (sigma - 4) / 14), measure: `ISO ${s.iso}, noise about ${f1(sigma)}`, summary: `ISO ${s.iso} produced visible noise.`, why: 'Each ISO doubling adds a stop of sensitivity and about 40% more noise.', fix: room >= 1 ? `Your shutter could have been ${Math.floor(room)} stop${Math.floor(room) > 1 ? 's' : ''} slower and still beaten shake, so ISO could drop to ${near(ISOS, s.iso / 2 ** Math.floor(room))}.` : `The shutter has no room to slow down, so open the aperture${s.aperture ? ` (now ${fmtF(s.aperture)})` : ''} or add light before raising ISO further.`, confidence: 'measured' });
    else if (sigma != null && sigma > 6 && s.iso <= 400) out.push({ id: 'iso', state: 'info', title: 'Noise at a low ISO', summary: `The noise is higher than ISO ${s.iso} normally gives. It may be from brightening a dark photo in editing, a hot sensor or in-camera processing.`, measure: `ISO ${s.iso}, noise about ${f1(sigma)}` });
    else if (s.iso >= 3200) out.push({ id: 'iso', state: 'good', title: 'High ISO, well handled', summary: `ISO ${s.iso} kept the noise low.`, measure: sigma != null ? `noise about ${f1(sigma)}` : null });
  }
  if (s.aperture) {
    const a = s.aperture, notes = [];
    if (a >= 16) out.push({ id: 'aperture', title: 'Tiny aperture softens detail', severity: 0.3, measure: fmtF(a), summary: `${fmtF(a)} can soften fine detail through diffraction.`, why: 'Past about f/11 to f/16 the light bends round the aperture blades and costs sharpness.', fix: 'Use f/8 to f/11 unless you need the extra depth of field.', confidence: 'estimated' });
    else if (goalIds.includes('landscape') && a < 4) out.push({ id: 'aperture', title: 'Wide aperture for a landscape', severity: 0.3, measure: fmtF(a), summary: `${fmtF(a)} gives a shallow depth of field, so much of a landscape will be soft.`, why: 'Landscapes usually need everything sharp, from the foreground to the horizon.', fix: 'Try f/8 to f/11 and focus about a third of the way into the scene.', confidence: 'estimated' });
    else if (goalIds.includes('portrait') && a > 8) out.push({ id: 'aperture', title: 'Small aperture for a portrait', severity: 0.3, measure: fmtF(a), summary: `${fmtF(a)} keeps the background sharp and busy behind a person.`, why: 'Portraits usually look best when the background melts away.', fix: 'Open to f/1.8 to f/4 and keep the subject away from the background.', confidence: 'estimated' });
    else {
      const iso = m.isolation, blur = iso && iso.ratio >= 3;
      out.push({ id: 'aperture', state: 'good', title: 'Aperture and depth of field', measure: fmtF(a), summary: a <= 2.8 ? `${fmtF(a)} is wide open${blur ? ', and the background is clearly softer than the subject' : ', so only a thin slice should be sharp'}.` : a >= 8 ? `${fmtF(a)} keeps most of the scene in focus.` : `${fmtF(a)} gives a balanced depth of field.` });
    }
  }
  if (s.wb) {
    const warm = m.colour.warm;
    if (s.wb === 'auto' && Math.abs(warm) > 0.8) out.push({ id: 'wbmode', state: 'info', title: 'Auto white balance, strong cast', summary: `Auto white balance left a ${warm > 0 ? 'warm' : 'cool'} cast. Cameras often keep some warmth on purpose, and scenes with one dominant colour fool them.`, fix: 'Try a preset (daylight, cloudy, tungsten) or a custom white balance from a grey card.', confidence: 'estimated' });
    else if (s.wb === 'manual') out.push({ id: 'wbmode', state: 'info', title: 'Manual white balance', summary: Math.abs(warm) > 0.8 ? 'You set white balance by hand, and the picture still leans warm or cool. Is that the look you wanted?' : 'You set white balance by hand and neutral areas look neutral.' });
  }
  if (s.ev != null && Math.abs(s.ev) >= 0.7) {
    if (s.ev <= -0.7 && L.evMid < -1.3) out.push({ id: 'evcomp', title: 'Exposure compensation darkened it', severity: 0.4, measure: `${f1(s.ev)} EV`, summary: `Exposure compensation was set to ${f1(s.ev)} EV and the photo is dark.`, why: 'Exposure compensation stays on until you reset it, which is a common cause of unexpectedly dark shots.', fix: 'Reset to 0 unless you wanted the dark look. Use the histogram, not the screen, to judge.', confidence: 'measured' });
    else if (s.ev >= 0.7 && L.clipHi > 0.01) out.push({ id: 'evcomp', title: 'Exposure compensation clipped highlights', severity: 0.4, measure: `+${f1(s.ev)} EV`, summary: `Exposure compensation was +${f1(s.ev)} EV and highlights have clipped.`, why: 'Brightening an already bright scene pushes the highlights past white.', fix: 'Bring it back toward 0 and check the highlight warning.', confidence: 'measured' });
    else out.push({ id: 'evcomp', state: 'info', title: 'Exposure compensation used', summary: `Exposure compensation was ${s.ev > 0 ? '+' : ''}${f1(s.ev)} EV. Reset it next time if it was not intended.` });
  }
  if (s.flash && L.clipHi > 0.02) out.push({ id: 'flash', title: 'Flash may be too strong', severity: 0.35, measure: 'flash fired', summary: 'The flash fired and highlights clipped.', why: 'Direct flash flattens faces and blows out near surfaces.', fix: 'Lower the flash power (−1 EV), bounce it off a ceiling or wall, or add a diffuser.', confidence: 'estimated' });
  // exposure plan: equivalent ways to add or remove light
  if (s.aperture && s.shutter && s.iso && (L.evMid < -1.3 || L.evMid > 1.1)) {
    const need = L.evMid < -1.3 ? Math.min(3, Math.round(-L.evMid - 0.5)) : -Math.min(3, Math.round(L.evMid - 0.5)), n = Math.abs(need), up = need > 0;
    if (n >= 1) {
      const lines = [], a2 = near(F_STOPS, s.aperture * 2 ** (-need / 2)), sh2 = near(SHUTTERS, s.shutter * 2 ** need), iso2 = near(ISOS, s.iso * 2 ** need), safe = eq ? sh2 * eq <= 1.4 : true;
      lines.push(`${up ? 'Open' : 'Close'} the aperture from ${fmtF(s.aperture)} to ${fmtF(a2)}`);
      lines.push(`${up ? 'Slow' : 'Speed up'} the shutter from ${formatShutter(s.shutter)} to ${formatShutter(sh2)}${up ? (safe ? ' (still within the 1/focal rule)' : ' (too slow to hold by hand at this focal length)') : ''}`);
      lines.push(`${up ? 'Raise' : 'Lower'} ISO from ${s.iso} to ${iso2}${up && iso2 >= 3200 ? ' (expect noise)' : ''}`);
      out.push({ id: 'exposurePlan', state: 'info', title: `To ${up ? 'brighten' : 'darken'} by ${n} stop${n > 1 ? 's' : ''}`, summary: `Any one of these gives about ${n} stop${n > 1 ? 's' : ''}: ${lines.join('; ')}.`, measure: `${n} stop${n > 1 ? 's' : ''}`, confidence: 'estimated' });
    }
  }
  return out;
}

/** Turn form values into the same shape the EXIF reader returns. */
export function settingsFromForm(f) {
  const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  let shutter = null; const sv = String(f.shutter || '').trim();
  if (/^1\s*\/\s*\d+/.test(sv)) shutter = 1 / parseFloat(sv.split('/')[1]); else shutter = num(sv.replace('s', ''));
  const out = { source: 'form', aperture: num(String(f.aperture || '').replace(/f\/?/i, '')), shutter, iso: num(f.iso), focal: num(f.focal), focal35: num(f.focal35), ev: f.ev === '' || f.ev == null || !isFinite(parseFloat(f.ev)) ? null : parseFloat(f.ev), wb: f.wb || null, flash: f.flash === 'on' ? true : f.flash === 'off' ? false : null, camera: null, lens: null, program: null };
  return Object.entries(out).some(([k, v]) => k !== 'source' && v !== null) ? out : null;
}
