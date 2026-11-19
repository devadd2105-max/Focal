// Turns measurements into advice. Two kinds of result:
//  findings   - things to fix or deliberately accept (each has a severity and a base weight)
//  techniques - classic framing techniques the photo does or does not use
// A stated goal can re-weight findings or mark a "fault" as deliberate (see intent.js).
import { mergeGoals } from './intent.js';
import { settingsFindings } from './settings.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pct = (v) => `${Math.round(v * 100)}%`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const P3 = [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]], PG = [[0.382, 0.382], [0.618, 0.382], [0.382, 0.618], [0.618, 0.618]];
const nearest = (pt, pts) => pts.map((p) => ({ p, d: dist(pt, p) })).sort((a, b) => a.d - b.d)[0];

export const WEIGHTS = { exposure: 16, clipHi: 12, clipLo: 9, contrast: 8, focus: 26, noise: 12, isolationFault: 10, shake: 14, iso: 5, aperture: 4, horizon: 14, verticals: 8, tangent: 6, cut: 8, placement: 10, subject: 8, small: 6, balance: 5, headroom: 6, cast: 9, saturation: 4, wbmode: 3, evcomp: 4, flash: 4, actionShutter: 10 };
export const GROUP_OF = { exposure: 'light', clipHi: 'light', clipLo: 'light', contrast: 'light', evcomp: 'light', flash: 'light', focus: 'focus', noise: 'focus', isolationFault: 'focus', shake: 'focus', iso: 'focus', aperture: 'focus', actionShutter: 'focus', horizon: 'comp', verticals: 'comp', tangent: 'comp', cut: 'comp', placement: 'comp', subject: 'comp', small: 'comp', balance: 'comp', headroom: 'comp', cast: 'colour', saturation: 'colour', wbmode: 'colour' };
Object.assign(WEIGHTS, { distraction: 5, glare: 5, clutter: 6, blends: 7, lightCharacter: 0, metering: 0 });
Object.assign(GROUP_OF, { distraction: 'comp', glare: 'comp', clutter: 'comp', blends: 'comp', lightCharacter: 'light', metering: 'light' });
export const GROUP_LABEL = { light: 'Light', focus: 'Sharpness', comp: 'Composition', colour: 'Colour', impact: 'Impact' };
const GROUP_CAP = { light: 30, focus: 34, comp: 34, colour: 12 };

/** How sharp is it? Uses edge steepness first, tile energy second, and admits when noise makes that unreliable. */
export function focusState(m) {
  const a = m.sharp.acuity, norm = m.sharp.top / Math.max(m.light.std, 8), noisy = (m.noise.sigma || 0) > 8;
  if (noisy) return { state: norm < 0.03 ? 'blurry' : 'noisy', norm, acuity: a };
  if (a === null && m.sharp.top < 0.6) return { state: 'nodetail', norm, acuity: a };
  if (a === null) return { state: norm >= 0.22 ? 'sharp' : norm >= 0.1 ? 'soft' : 'blurry', norm, acuity: a };
  if (norm >= 0.22 || a >= 0.09) return { state: 'sharp', norm, acuity: a };
  return { state: a < 0.045 ? 'blurry' : 'soft', norm, acuity: a };
}

export const TECH = {
  thirds: { label: 'Rule of thirds', group: 'Placement', how: 'Place the subject where two of the imaginary thirds lines cross.' },
  golden: { label: 'Golden ratio and spiral', group: 'Placement', how: 'Put the subject near the points about 38% and 62% across the frame, slightly nearer the centre than thirds.' },
  centred: { label: 'Centred subject', group: 'Placement', how: 'A dead-centre subject works with symmetry or a strong, simple shape.' },
  diagonals: { label: 'Diagonals', group: 'Placement', how: 'Run lines or the subject along a corner-to-corner diagonal for energy.' },
  triangles: { label: 'Triangles', group: 'Placement', how: 'Three points of interest that form a triangle give a stable, pleasing structure. A diagonal split into two triangles (the golden triangle) does the same.' },
  odds: { label: 'Rule of odds', group: 'Placement', how: 'Groups of three or five elements feel more natural than pairs.' },
  leadingRoom: { label: 'Looking and leading room', group: 'Placement', how: 'Leave more space in the direction a subject faces or moves.' },
  headroom: { label: 'Headroom', group: 'Placement', how: 'Leave a small gap above a head. Too little feels cramped; too much feels empty.' },
  leadingLines: { label: 'Leading lines and vanishing point', group: 'Lines and shape', how: 'Roads, fences and rails that lead the eye to the subject.' },
  symmetry: { label: 'Symmetry', group: 'Lines and shape', how: 'Mirror halves work best when you centre them exactly.' },
  reflection: { label: 'Reflection symmetry', group: 'Lines and shape', how: 'Water or glass doubles the scene top to bottom.' },
  repetition: { label: 'Pattern and repetition', group: 'Lines and shape', how: 'Repeated shapes create rhythm. Break the pattern for a focal point.' },
  dutch: { label: 'Dutch angle', group: 'Lines and shape', how: 'A deliberate tilt of 10 to 30 degrees adds tension. Make it obvious so it does not look like a mistake.' },
  frame: { label: 'Frame within a frame', group: 'Space and depth', how: 'Use a doorway, arch or branches to frame the subject.' },
  negativeSpace: { label: 'Negative space', group: 'Space and depth', how: 'Large calm areas give the subject room to breathe.' },
  fill: { label: 'Fill the frame', group: 'Space and depth', how: 'Get close so the subject dominates and distractions drop out.' },
  layers: { label: 'Foreground, middle and background', group: 'Space and depth', how: 'Add something near the camera to build depth.' },
  isolation: { label: 'Subject isolation (shallow depth of field)', group: 'Space and depth', how: 'A wide aperture and distance behind the subject blur the background.' },
  silhouette: { label: 'Silhouette', group: 'Light and colour', how: 'Expose for a bright sky and let a clear shape go dark.' },
  lowKey: { label: 'Low-key', group: 'Light and colour', how: 'Mostly dark tones with small bright accents for mood.' },
  highKey: { label: 'High-key', group: 'Light and colour', how: 'Mostly light tones with few shadows for an airy look.' },
  harmony: { label: 'Colour harmony', group: 'Light and colour', how: 'Complementary colours (opposites on the colour wheel) pop; neighbours feel calm.' },
  monochrome: { label: 'Monochrome', group: 'Light and colour', how: 'Remove colour so shape, light and texture carry the picture.' },
};
export const NOT_MEASURED = ['S-curves', 'Juxtaposition', 'Scale and context', 'Emotion and story', 'Originality'];

/* ----------------------------------------------------------- findings */
function baseFindings(m, settings, goalIds) {
  const out = [], L = m.light, s = m.subject, add = (f) => out.push({ confidence: 'measured', state: 'issue', severity: 0, ...f, weight: WEIGHTS[f.id] ?? 5, group: GROUP_OF[f.id] ?? 'comp' });
  const fs = focusState(m);

  // ---- light
  const ev = L.evMid, I = m.impact, dark = !!(I && ev < -1.3 && (L.p99 > 200 || I.vHi > 200));
  if (dark) add({ id: 'exposure', title: 'Dark scene with bright accents', confidence: 'estimated', severity: clamp((-ev - 1.3) / 2.2) * 0.3, measure: `${f1(-ev)} stops below middle grey overall`, summary: 'Most of the frame is dark, but a few areas are bright. That reads as a night or low-key scene.', why: 'Night and low-key pictures are meant to be dark. They go wrong when the bright accents blow out or the dark areas hold no texture.', fix: 'Check the bright lights are not pure white (see the zebra overlay). If you want more of the scene visible, add one stop and keep the highlights under control.', overlay: 'zebra' });
  else if (ev < -1.3) add({ id: 'exposure', title: 'Underexposed', severity: clamp((-ev - 1.3) / 2.2), measure: `${f1(-ev)} stops below middle grey`, summary: 'The picture is darker than a typical well-exposed scene.', why: 'Median brightness sits well below middle grey, so shadows and mid-tones are muddy and noise shows when you brighten it.', fix: `Add about ${f1(Math.min(3, -ev - 0.5))} stops: raise exposure compensation, open the aperture, slow the shutter, or raise ISO. Check the histogram leans right.`, overlay: 'zebra' });
  else if (ev > 1.1) add({ id: 'exposure', title: 'Overexposed', severity: clamp((ev - 1.1) / 2), measure: `${f1(ev)} stops above middle grey`, summary: 'The picture is brighter than a typical well-exposed scene.', why: 'Median brightness sits well above middle grey, so highlight detail is at risk and colours wash out.', fix: `Pull back about ${f1(Math.min(3, ev - 0.5))} stops: lower exposure compensation, close the aperture or shorten the shutter. Watch the red zebras.`, overlay: 'zebra' });
  else add({ id: 'exposure', state: 'good', title: 'Exposure', measure: `${ev >= 0 ? '+' : ''}${f1(ev)} EV vs middle grey`, summary: 'Overall brightness is in a comfortable range.' });
  if (L.clipHi > 0.01) add({ id: 'clipHi', title: 'Blown highlights', severity: clamp((L.clipHi - 0.01) / 0.12), measure: `${pct(L.clipHi)} of pixels pure white`, summary: 'Some bright areas have lost all detail.', why: 'Pure white cannot be recovered later, even from a RAW file if it clipped at capture.', fix: 'Expose for the highlights: lower exposure by one stop, or add a graduated filter. The red zebra overlay shows where.', overlay: 'zebra' });
  if (L.clipLo > 0.04) add({ id: 'clipLo', title: 'Crushed shadows', severity: clamp((L.clipLo - 0.04) / 0.25) * (dark ? 0.3 : 1), measure: `${pct(L.clipLo)} of pixels pure black`, summary: 'Dark areas have no detail left.', why: 'Large areas of solid black look heavy and hide texture.', fix: 'Raise exposure slightly, add fill light or a reflector, or lift shadows when editing. The blue zebra overlay shows where.', overlay: 'zebra' });
  if (L.range < 100 && !dark) add({ id: 'contrast', title: 'Flat contrast', severity: clamp((100 - L.range) / 100), measure: `tonal range ${Math.round(L.range)} of 255`, summary: 'Tones are squeezed into a narrow band, so the picture looks hazy.', why: 'Without both a real black and a real white, images look dull.', fix: 'Add contrast when editing, shoot with directional light, or remove haze with a lens hood or polariser.' });

  // ---- sharpness and noise
  if (fs.state === 'blurry' || fs.state === 'soft') {
    const blurry = fs.state === 'blurry';
    add({ id: 'focus', title: blurry ? 'Blurry' : 'Slightly soft', severity: blurry ? 0.9 : 0.5, measure: fs.acuity != null ? `edge sharpness ${f1(fs.acuity * 100)} (sharp photos read 10 or more)` : 'low edge detail', summary: blurry ? 'Even the sharpest area is blurred.' : 'The sharpest areas are not fully crisp.', why: 'Edges are spread over several pixels. That is either missed focus, subject motion or camera shake.', fix: 'Use a faster shutter (at least 1 over your focal length), brace the camera, and focus on the subject. For a moving subject go to 1/500 s or faster.', overlay: 'focus' });
  } else if (fs.state === 'noisy') add({ id: 'focus', state: 'info', title: 'Focus is hard to judge', summary: 'Heavy noise hides fine detail, so sharpness cannot be measured reliably.', confidence: 'estimated' });
  else if (fs.state === 'nodetail') add({ id: 'focus', state: 'info', title: 'No fine detail to judge', summary: 'The picture is too smooth to measure focus.', confidence: 'estimated' });
  else add({ id: 'focus', state: 'good', title: 'Sharpness', measure: fs.acuity != null ? `edge sharpness ${f1(fs.acuity * 100)}` : 'crisp detail', summary: 'Edges are crisp where the camera focused.', overlay: 'focus' });
  const sigma = m.noise.shadow ?? m.noise.sigma;
  if (sigma != null && sigma > 3) add({ id: 'noise', title: sigma > 12 ? 'Very noisy' : sigma > 6 ? 'Visible noise' : 'Slight noise', severity: clamp((sigma - 3) / 14), measure: `noise level about ${f1(sigma)} of 255`, summary: 'Grain from a high ISO or from brightening a dark image.', why: 'Noise hides fine detail and shows most in smooth areas and shadows.', fix: 'Lower the ISO, expose brighter (noise is worse in shadows), or use noise reduction while editing.' });
  if (s && m.isolation && fs.state === 'sharp' && m.isolation.ratio < 0.6 && s.area > 0.01 && m.isolation.outside > 1.5)
    add({ id: 'isolationFault', title: 'Focus may be behind the subject', confidence: 'estimated', severity: 0.55, measure: `subject is ${f1(1 / Math.max(m.isolation.ratio, 0.1))}x softer than its surroundings`, summary: 'The main subject looks softer than the background.', why: 'The camera probably locked focus on something nearer or farther than the subject.', fix: 'Tap or move the focus point onto the subject (the eye for people and animals), and check with the focus overlay.', overlay: 'focus' });

  // ---- geometry
  const hz = m.lines.horizon;
  if (hz) {
    const t = hz.angle, a = Math.abs(t), dir = t > 0 ? 'clockwise' : 'anticlockwise';
    if (a < 0.6) add({ id: 'horizon', state: 'good', title: 'Level horizon', measure: `${f1(a)}° off level`, summary: 'The main horizontal line is level.', overlay: 'horizon', rotate: 0 });
    else if (hz.converging && a <= 12) add({ id: 'horizon', title: 'Slanted lines (probably perspective)', confidence: 'estimated', severity: 0.15, measure: `${f1(a)}° ${dir}`, summary: 'Long lines lean in opposite directions, so they converge. That is usually perspective, not a tilted camera.', why: 'A true tilt moves every horizontal line the same way. Lines that meet come from looking along a wall, bridge or road.', fix: 'Check a line you know is level, such as the sea or a window ledge, before you rotate the picture.', overlay: 'horizon', rotate: 0 });
    else if (a <= 8) add({ id: 'horizon', title: 'Tilted horizon', severity: clamp(0.2 + (a - 0.6) / 9, 0, 0.85), measure: `${f1(a)}° ${dir}`, summary: `The strongest horizontal line leans ${f1(a)}° ${dir}.`, why: 'A slight tilt reads as a mistake because the eye expects horizons to be level.', fix: `Rotate it ${f1(a)}° ${t > 0 ? 'anticlockwise' : 'clockwise'}. The Straighten button does it and crops the edges.`, overlay: 'horizon', rotate: -t });
    else if (a <= 35) add({ id: 'horizon', title: 'Strongly tilted line', confidence: 'estimated', severity: 0.5, measure: `${f1(a)}° ${dir}`, summary: `A strong line leans ${f1(a)}°. If you tilted on purpose, that is a Dutch angle.`, why: 'A tilt this big either looks like an accident or like a deliberate style.', fix: 'If it is accidental, straighten it. If you want tension, exaggerate it so it clearly looks intentional.', overlay: 'horizon', rotate: -t });
  }
  const vt = m.lines.verticalTilt;
  if (vt != null && m.lines.verticalCount >= 3 && Math.abs(vt) > 1.2 && Math.abs(vt) < 15) add({ id: 'verticals', title: 'Leaning verticals', confidence: 'estimated', severity: clamp(0.2 + (Math.abs(vt) - 1.2) / 8, 0, 0.6), measure: `${f1(Math.abs(vt))}° lean`, summary: 'Vertical lines such as walls and poles lean.', why: 'Tilting the camera up makes buildings fall backwards.', fix: 'Keep the camera level and stand further back, or correct perspective when editing.', overlay: 'lines' });
  if (m.lines.tangents.length) { const t = m.lines.tangents[0]; add({ id: 'tangent', title: 'Line hugs the frame edge', confidence: 'estimated', severity: 0.35, measure: `a line runs along the ${t.side} edge`, summary: 'A strong line runs almost along the edge of the frame.', why: 'Lines that almost touch the edge draw the eye to the border and look like a near miss.', fix: `Reframe so the line sits clearly inside the frame or leaves it completely at the ${t.side}.`, overlay: 'lines' }); }
  if (s && m.lines.cutSides.length) add({ id: 'cut', title: 'Subject cut by the edge', confidence: 'estimated', severity: 0.5, measure: `touches the ${m.lines.cutSides.join(' and ')} edge`, summary: `The main subject runs into the ${m.lines.cutSides.join(' and ')} edge of the frame.`, why: 'Cropping a subject at the frame edge looks accidental unless it is clearly intended.', fix: 'Step back or reframe so the whole subject fits, or crop tighter so it looks deliberate.', overlay: 'subject' });

  // ---- subject, placement, balance
  const masses = m.blobs.map((b) => b.mass), total = masses.reduce((a, b) => a + b, 0) || 1, dominance = masses.length ? masses[0] / total : 0;
  if (m.blobs.length >= 5 && dominance < 0.24) add({ id: 'subject', title: 'No clear subject', confidence: 'estimated', severity: 0.35, measure: `${m.blobs.length} competing areas`, summary: 'Several areas compete for attention.', why: 'When nothing stands out, viewers do not know where to look.', fix: 'Move closer, simplify the background, or use light and colour contrast to make one thing win.', overlay: 'subject' });
  const pl = placement(m);
  if (s && pl && dominance >= 0.34) {
    if (pl.best.fit < 0.3 && pl.fits.centred.d > 0.16 && m.space.largest < 0.5) add({ id: 'placement', title: 'Subject in a dead zone', confidence: 'estimated', severity: clamp(0.25 + (0.3 - pl.best.fit)), measure: `${pct(s.cx)} across, ${pct(s.cy)} down`, summary: 'The subject sits away from the usual strong positions.', why: 'Thirds, golden-ratio, centred and diagonal placements all give a picture structure. This one fits none closely.', fix: 'Shift the subject toward a thirds intersection (or centre it if the scene is symmetrical). The Crops tab shows tested options.', overlay: 'grid' });
  }
  if (s && s.area < 0.015 && m.space.largest < 0.3 && m.blobs.length >= 2) add({ id: 'small', title: 'Subject is small', confidence: 'estimated', severity: 0.35, measure: `about ${pct(s.area)} of the frame`, summary: 'The main subject is small and surrounded by detail.', why: 'A small subject in a busy scene gets lost.', fix: 'Move closer, zoom in or crop tighter. If you want a tiny subject, empty the space around it.', overlay: 'subject' });
  const bx = m.balance.x - 0.5, byy = m.balance.y - 0.5, off = Math.hypot(bx, byy);
  if (off > 0.17) {
    const sideSpace = m.space.largest >= 0.2 && Math.sign(m.space.cx - 0.5) === -Math.sign(bx) && Math.abs(m.space.cx - 0.5) > 0.12;
    if (!sideSpace) add({ id: 'balance', title: 'Lopsided weight', confidence: 'estimated', severity: clamp((off - 0.17) / 0.2) * 0.7, measure: `weight sits ${pct(Math.abs(bx))} ${bx > 0 ? 'right' : 'left'} of centre`, summary: 'Most of the visual weight is on one side.', why: 'A heavy side with nothing opposite feels like it is tipping.', fix: 'Add a lighter counterweight on the other side, or leave calm empty space there to balance it.', overlay: 'subject' });
  }
  if (goalIds.some((g) => ['portrait', 'nature', 'macro'].includes(g)) && s && s.area > 0.02) {
    const gap = s.y0;
    if (gap < 0.04) add({ id: 'headroom', title: 'No headroom', confidence: 'estimated', severity: 0.6, measure: `${pct(gap)} above the subject`, summary: 'The subject almost touches the top edge.', why: 'Heads that touch the top of the frame feel cramped.', fix: 'Tilt the camera up a little, or step back, so there is a small gap above.', overlay: 'subject' });
    else if (gap > 0.4) add({ id: 'headroom', title: 'Too much headroom', confidence: 'estimated', severity: 0.4, measure: `${pct(gap)} of empty space above`, summary: 'There is a lot of empty space above the subject.', why: 'Too much headroom makes the subject look like it is sinking.', fix: 'Tilt down or crop the top so the subject sits higher in the frame.', overlay: 'subject' });
  }

  // ---- colour
  const c = m.colour, castAmt = Math.abs(c.warm), tintAmt = Math.abs(c.tint);
  if (castAmt > 0.75 || tintAmt > 0.3) {
    const warm = c.warm > 0, big = castAmt > 0.75, name = big ? (warm ? 'warm (orange)' : 'cool (blue)') : (c.tint > 0 ? 'green' : 'magenta');
    add({ id: 'cast', title: `${name[0].toUpperCase()}${name.slice(1)} colour cast`, confidence: 'estimated', severity: clamp(big ? 0.3 + (castAmt - 0.75) / 1.2 : 0.2 + (tintAmt - 0.3) / 0.5, 0.2, 0.85) * (c.neutralShare > 0.08 ? 1 : 0.75), measure: big ? `${warm ? 'red' : 'blue'} channel ${f1(Math.pow(2, castAmt))}x the ${warm ? 'blue' : 'red'} in neutral areas` : `${name} shift`, summary: `Neutral areas lean ${name}.`, why: 'Greys and whites that are not neutral usually point to a white-balance mismatch. It can also be real light such as a sunset, or a colourful scene, so judge by eye.', fix: 'Set a custom white balance from a white or grey object, pick the right preset, or correct it in editing with the dropper on a neutral area.', overlay: 'none' });
  }
  if (c.sat > 0.62) add({ id: 'saturation', title: 'Oversaturated', severity: clamp((c.sat - 0.62) / 0.25), measure: `average saturation ${pct(c.sat)}`, summary: 'Colours are very intense.', why: 'Extreme saturation clips colour detail and looks artificial.', fix: 'Lower saturation or vibrance a little.' });


  // ---- what pulls the eye away, and how well the subject stands out
  if (I && s) {
    const lowKeyScene = dark || I.histogram.id === 'under' || I.histogram.id === 'lowkey';
    if (I.edge && I.edge.share >= 0.4) add({ id: 'distraction', title: 'Distraction at the frame edge', confidence: 'estimated', severity: clamp(0.2 + (I.edge.share - 0.4) * 0.8, 0, 0.5), measure: `strong marks along the ${I.edge.side} edge`, summary: `Something bright or busy sits against the ${I.edge.side} edge, away from the subject.`, why: 'Anything with strong contrast near the border pulls the eye off the subject, and objects gain visual weight the closer they sit to the edge.', fix: 'Crop it out, shift your position slightly, or tone it down in editing. Scan the edges before you press the shutter, not just the subject.', overlay: 'subject' });
    if (I.glare && I.glare.count >= 40 && I.glare.share >= 0.004) add({ id: 'glare', title: 'Scattered bright highlights', confidence: 'estimated', severity: clamp(0.2 + I.glare.share * 25, 0, 0.55), measure: `${I.glare.count} small bright spots, ${(I.glare.share * 100).toFixed(1)}% of the frame`, summary: 'Many tiny, very bright spots (glare on water or shiny surfaces) compete with the subject.', why: 'The eye goes to the brightest points in a picture. A scatter of sparkles gives it many places to land.', fix: 'Move to a different angle to lose the reflection, use a polarising filter, shoot when the sun is lower, or tone the highlights down when editing.', overlay: 'zebra' });
    if (I.clutter != null && I.clutter >= 0.75 && (!m.isolation || m.isolation.ratio < 2)) add({ id: 'clutter', title: 'Busy background', confidence: 'estimated', severity: clamp(0.15 + (I.clutter - 0.75) * 1.2, 0, 0.45), measure: `${pct(I.clutter)} of the area around the subject is busy`, summary: 'The area around the subject has a lot of detail and is as sharp as the subject.', why: 'When the background is as detailed as the subject, nothing tells the eye which one matters.', fix: 'Open the aperture or step further from the background to blur it, change your angle to a calmer backdrop, or move closer so the subject fills the frame.', overlay: 'subject' });
    if (!lowKeyScene && I.separation != null && I.separation < 0.35) add({ id: 'blends', title: 'Subject blends into its surroundings', confidence: 'estimated', severity: clamp(0.15 + (0.35 - I.separation) * 1.2, 0, 0.5), measure: `colour and brightness difference ${Math.round(I.deltaE)} (strong separation is 30 or more)`, summary: 'The subject is close to its background in both brightness and colour.', why: 'Photos work when the subject separates from what is behind it, through a difference in brightness, colour or sharpness.', fix: 'Pick a darker or lighter backdrop, light the subject from the side, use a contrasting colour, or blur the background with a wider aperture.', overlay: 'subject' });
    if (I.direction) {
      const d = I.direction, q = I.quality;
      const where = d.kind === 'side' ? `from the ${d.from}` : d.kind === 'top' ? 'from above' : d.kind === 'below' ? 'from below' : 'evenly';
      const tip = d.kind === 'even' ? (q === 'soft' ? 'Even, soft light is kind to faces and flowers but can look flat. Look for a little shadow on one side to give shape.' : 'Light that falls evenly gives little sense of shape. Turn the subject or move until one side is brighter.') : d.kind === 'side' ? 'Side light reveals texture and form. It is one of the most useful directions, especially at golden hour.' : d.kind === 'top' ? 'Light from above is typical at midday. It casts shadows under eyes and noses, so look for shade or a reflector for people.' : 'Light from below looks unusual and dramatic. Use it on purpose.';
      add({ id: 'lightCharacter', state: 'info', confidence: 'estimated', title: `Light: ${q}, ${where}`, summary: `The subject looks ${q === 'hard' ? 'hard lit, with strong shadows and highlights' : q === 'soft' ? 'softly lit, with gentle shadows' : 'moderately lit'}${I.golden ? ' with warm, low-sun colour' : ''}, ${where}. ${tip}`, measure: `${q} light` });
    }
    if (I.quality === 'hard' && (L.clipHi > 0.01 || L.clipLo > 0.04) && !dark) add({ id: 'metering', state: 'info', confidence: 'estimated', title: 'Try spot or partial metering', summary: 'This is a high-contrast scene, and both ends of the histogram are clipping. The camera\'s average metering is being pulled by the extremes.', why: 'Evaluative metering averages the whole scene. A bright sky or a dark shadow can fool it, so the subject ends up too dark or too bright.', fix: 'Switch to spot or partial metering and read the subject itself. Use exposure compensation if the subject is much brighter or darker than middle grey.' });
  }

  for (const f of settingsFindings(m, settings, goalIds, fs)) add(f);
  return out;
}

/* --------------------------------------------------- placement fits */
export function placement(m) {
  const s = m.subject; if (!s) return null;
  const pt = [s.cx, s.cy], t = nearest(pt, P3), g = nearest(pt, PG), cd = dist(pt, [0.5, 0.5]);
  const dd = Math.min(Math.abs(s.cx - s.cy), Math.abs(s.cx + s.cy - 1)) / Math.SQRT2;
  const fits = { thirds: { fit: clamp(1 - t.d / 0.13), d: t.d, at: t.p }, golden: { fit: clamp(1 - g.d / 0.1), d: g.d, at: g.p }, centred: { fit: clamp(1 - cd / 0.12), d: cd, at: [0.5, 0.5] }, diagonals: { fit: clamp(1 - dd / 0.07), d: dd, at: pt } };
  // golden only counts as its own technique when it is clearly closer than thirds
  const best = Object.entries(fits).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.fit - a.fit)[0];
  return { fits, best };
}

/* ------------------------------------------------------- techniques */
export function techniques(m, settings) {
  const out = [], pl = placement(m), s = m.subject, L = m.light, c = m.colour, hz = m.lines.horizon;
  const add = (id, used, detail, confidence = 'measured', extra = {}) => out.push({ id, ...TECH[id], used, detail, confidence, ...extra });
  const dir = (v) => (v < 0.45 ? 'left' : v > 0.55 ? 'right' : 'centre');
  if (pl) {
    const { thirds, golden, centred, diagonals } = pl.fits;
    add('thirds', thirds.fit >= 0.55, thirds.fit >= 0.55 ? `The subject is ${pct(thirds.d)} of the frame from a thirds intersection.` : `The nearest thirds intersection is ${pct(thirds.d)} of the frame away.`, 'estimated', { overlay: 'thirds' });
    add('golden', golden.fit >= 0.55 && golden.fit > thirds.fit + 0.1, golden.fit >= 0.55 ? `The subject sits close to a golden-ratio point (${pct(golden.d)} away).` : 'The subject is not near a golden-ratio point.', 'estimated', { overlay: 'golden' });
    add('centred', centred.fit >= 0.7 && (m.symmetry.lr >= 0.5 || m.blobs.length <= 2), centred.fit >= 0.7 ? 'The subject is in the middle of the frame.' : 'The subject is off-centre.', 'estimated', { overlay: 'grid' });
    add('diagonals', diagonals.fit >= 0.6 || (m.lines.diagShare >= 0.45 && m.lines.list.length >= 3), m.lines.diagShare >= 0.45 ? `${pct(m.lines.diagShare)} of the line energy runs diagonally.` : diagonals.fit >= 0.6 ? 'The subject sits on a diagonal of the frame.' : 'No strong diagonal structure.', 'estimated', { overlay: 'diagonals' });
  } else for (const id of ['thirds', 'golden', 'centred', 'diagonals']) add(id, null, 'No clear subject to place.', 'estimated');
  const big = m.blobs.filter((b) => b.mass >= 0.35 * (m.blobs[0]?.mass || 1)), n = big.length;
  add('odds', n === 3 || n === 5, n ? `${n} main element${n > 1 ? 's' : ''} found${n === 3 || n === 5 ? ', an odd group' : n === 2 ? ' (a pair)' : ''}.` : 'No distinct elements found.', 'estimated', { overlay: 'subject' });
  { const t3 = big.slice(0, 3), area3 = t3.length === 3 ? Math.abs((t3[1].cx - t3[0].cx) * (t3[2].cy - t3[0].cy) - (t3[2].cx - t3[0].cx) * (t3[1].cy - t3[0].cy)) / 2 : 0;
    add('triangles', area3 >= 0.035, area3 >= 0.035 ? 'Three main elements form a triangle, which gives the picture a stable structure.' : t3.length === 3 ? 'The three main elements sit almost in a line.' : 'Fewer than three main elements to form a triangle.', 'estimated', { overlay: 'subject' }); }
  if (s) { const side = dir(s.cx); add('leadingRoom', side !== 'centre' && s.area > 0.01, side === 'centre' ? 'The subject is central, so room is equal on both sides.' : `The subject is on the ${side}, leaving ${pct(side === 'left' ? 1 - s.cx : s.cx)} of the frame on the other side. This works if it faces or moves that way.`, 'estimated'); }
  const vp = m.lines.vanishing;
  add('leadingLines', !!vp || (m.lines.diagShare >= 0.5 && m.lines.list.length >= 3), vp ? `${vp.lines} lines converge ${vp.inside ? 'inside the frame' : 'just outside the frame'} near ${pct(vp.x)} across, ${pct(vp.y)} down.` : 'No lines converge toward a point.', 'estimated', { overlay: 'lines' });
  add('symmetry', m.symmetry.lr >= 0.7, m.symmetry.lr >= 0.7 ? `The left and right halves match closely (${pct(m.symmetry.lr)}).` : `The halves differ (${pct(m.symmetry.lr)} match).`, 'measured', { overlay: 'axis' });
  add('reflection', m.symmetry.tb >= 0.7, m.symmetry.tb >= 0.7 ? `The top and bottom mirror each other (${pct(m.symmetry.tb)}).` : 'The top and bottom are not mirror images.', 'measured');
  add('repetition', m.repeat.strength >= 0.55, m.repeat.strength >= 0.55 ? `A pattern repeats about every ${pct(m.repeat.period)} of the ${m.repeat.axis === 'x' ? 'width' : 'height'}.` : 'No repeating pattern.', 'estimated');
  add('dutch', !!(hz && Math.abs(hz.angle) >= 8 && Math.abs(hz.angle) <= 35), hz && Math.abs(hz.angle) >= 8 && Math.abs(hz.angle) <= 35 ? `A strong line is tilted ${f1(Math.abs(hz.angle))}°. Intentional or accidental is for you to say.` : 'The horizon is level or has no strong tilt.', 'estimated');
  add('frame', m.frame.diff >= 60 && m.frame.ringDarkShare >= 0.6, m.frame.diff >= 60 && m.frame.ringDarkShare >= 0.6 ? 'A dark border surrounds a brighter centre, like a doorway or arch.' : 'No dark surround framing the centre.', 'estimated');
  add('negativeSpace', m.space.largest >= 0.3, m.space.largest >= 0.3 ? `${pct(m.space.largest)} of the frame is one calm, empty area.` : 'No large empty area.', 'measured', { overlay: 'space' });
  const area = s ? (s.x1 - s.x0) * (s.y1 - s.y0) : 0;
  add('fill', area >= 0.3, area >= 0.3 ? `The main subject fills about ${pct(area)} of the frame.` : `The main subject takes about ${pct(area)} of the frame.`, 'estimated');
  add('layers', m.layers.count >= 3, m.layers.count >= 3 ? 'Detail and tone change from near to far, which suggests foreground, middle and background layers.' : 'The depth looks flat, without clear layers.', 'estimated');
  const iso = m.isolation;
  add('isolation', !!(iso && iso.ratio >= 3 && iso.inside > 2), iso && iso.ratio >= 3 ? `The subject is about ${f1(iso.ratio)}x sharper than its surroundings.` : 'The background is about as sharp as the subject.', 'estimated', { overlay: 'focus' });
  const sil = L.fracDark >= 0.28 && L.fracBright >= 0.12 && L.p5 < 25 && L.p95 > 140 && L.median < 120;
  add('silhouette', sil, sil ? 'Large black shapes against a much brighter area.' : 'No dark shapes against a bright background.', 'estimated');
  add('lowKey', L.key === 'low' && L.median < 80, L.key === 'low' ? 'Most tones are dark.' : 'Tones are not mostly dark.', 'measured');
  add('highKey', L.key === 'high' && L.clipLo < 0.01, L.key === 'high' ? 'Most tones are light.' : 'Tones are not mostly light.', 'measured');
  const harmonic = ['complementary', 'analogous', 'monochrome'].includes(c.harmony) && c.sat > 0.18;
  add('harmony', harmonic, harmonic ? `The colours form a ${c.harmony} scheme.` : 'The colours do not form a clear scheme.', 'estimated');
  add('monochrome', c.sat < 0.06, c.sat < 0.06 ? 'Black and white (or nearly).' : 'In colour.', 'measured');
  return out;
}


/* -------------------------------------------------- impact (what works) */
const STRUCTURAL = ['thirds', 'golden', 'centred', 'diagonals', 'leadingLines', 'symmetry', 'reflection', 'negativeSpace', 'frame', 'layers', 'triangles', 'repetition', 'fill'];
export function impactScore(m, used, techs) {
  const I = m.impact, c = m.colour, L = m.light, strengths = [], lifts = [];
  if (!I) return { score: 60, strengths, lifts };
  const masses = m.blobs.map((b) => b.mass), total = masses.reduce((a, b) => a + b, 0) || 1, dominance = masses.length ? masses[0] / total : 0;
  const lowKeyScene = I.histogram.id === 'under' || I.histogram.id === 'lowkey';
  // 1. clarity: does one thing stand out from what is behind it?
  const sep = I.separation ?? 0.3, calm = I.clutter == null ? 0.5 : clamp(1 - I.clutter, 0, 1), clarity = clamp(0.5 * sep + 0.25 * calm + 0.25 * clamp(dominance / 0.45, 0, 1), 0, 1);
  // 2. light: a real tonal range, shape from direction, warm low sun
  const rangeOk = clamp((L.range - 70) / 120, 0, 1), shape = !I.direction ? 0.2 : I.direction.kind === 'side' ? 1 : I.direction.kind === 'top' || I.direction.kind === 'below' ? 0.6 : 0.2;
  const lightS = clamp(0.5 * rangeOk + 0.3 * shape + (I.golden ? 0.2 : 0), 0, 1) * (lowKeyScene && I.vHi > 200 ? 1 : lowKeyScene ? 0.6 : 1);
  // 3. colour: a scheme and a restrained palette
  const hv = { complementary: 1, analogous: 0.85, monochrome: 0.8, contrast: 0.5, neutral: 0.4 }[c.harmony] ?? 0.4, colourS = clamp(0.6 * hv + 0.4 * clamp((I.concentration - 0.3) / 0.35, 0, 1), 0, 1);
  // 4. depth: layers and a sharpness gradient
  const iso = m.isolation, depth = clamp(clamp(m.layers.count / 3, 0, 1) * 0.5 + (iso && iso.ratio >= 3 ? 0.5 : iso && iso.ratio >= 1.8 ? 0.25 : 0), 0, 1);
  // 5. structure: placement, lines and shape techniques that are present
  const nStruct = STRUCTURAL.filter((id) => used.has(id)).length, structure = clamp(nStruct / 3, 0, 1);
  const score = Math.round(clamp(100 * (0.32 * clarity + 0.24 * lightS + 0.14 * colourS + 0.12 * depth + 0.18 * structure), 5, 100));

  // what is working
  if (I.separation != null && I.separation >= 0.7) strengths.push({ title: 'The subject stands out', detail: `It differs clearly from its background in brightness and colour (difference ${Math.round(I.deltaE)}).` });
  if (m.isolation && m.isolation.ratio >= 3) strengths.push({ title: 'Background falls away', detail: `The subject is about ${Math.round(m.isolation.ratio * 10) / 10}x sharper than what surrounds it, which guides the eye.` });
  if (c.harmony === 'complementary' && c.sat > 0.18) strengths.push({ title: 'Complementary colours', detail: 'Opposite colours on the colour wheel make each other look stronger.' });
  else if ((c.harmony === 'analogous' || c.harmony === 'monochrome') && c.sat > 0.18) strengths.push({ title: 'Harmonious palette', detail: 'The colours sit close together on the wheel, which feels calm and cohesive.' });
  if (I.direction && I.direction.kind === 'side') strengths.push({ title: 'Light that shapes the subject', detail: `Light falls from the ${I.direction.from}, which gives the subject form and texture.` });
  if (I.golden) strengths.push({ title: 'Warm, low-sun colour', detail: 'The warm tones suggest light from near sunrise or sunset, usually the most flattering.' });
  if (I.histogram.id === 'balanced' && !I.edge) strengths.push({ title: 'Clean edges and a healthy histogram', detail: 'Tones spread from shadow to highlight and nothing strong sits on the border.' });
  if (m.layers.count >= 3) strengths.push({ title: 'Layers give depth', detail: 'Detail changes from near to far, which suggests a foreground, middle and background.' });
  const nice = techs.filter((t) => t.used && ['thirds', 'golden', 'diagonals', 'leadingLines', 'symmetry', 'reflection', 'negativeSpace', 'frame', 'triangles'].includes(t.id));
  for (const t of nice.slice(0, 2)) strengths.push({ title: t.label, detail: t.detail });

  // how to lift it (only things that would actually add impact)
  if (I.separation != null && I.separation < 0.5 && !lowKeyScene) lifts.push({ title: 'Make the subject stand out more', detail: 'Give it a darker or lighter backdrop, a contrasting colour, or blur what is behind it.' });
  if (I.direction && I.direction.kind === 'even' && !lowKeyScene) lifts.push({ title: 'Look for shaping light', detail: 'Even light is flat. Turn the subject, or wait until light falls from one side or low sun adds a glow.' });
  if (m.layers.count < 2 && !lowKeyScene) lifts.push({ title: 'Add depth with a foreground', detail: 'Include something near the camera, such as a leaf or a rail, so the scene has a near, middle and far layer.' });
  if (!nice.length) lifts.push({ title: 'Give the picture a structure', detail: 'Use leading lines, a triangle of interest, thirds placement or a calm empty area so the eye has a path.' });
  if (c.harmony === 'neutral' || c.harmony === 'contrast') lifts.push({ title: 'Simplify the colour', detail: 'Limit the palette to two or three colours, or let one accent colour stand out from muted surroundings.' });
  if (I.concentration < 0.45) lifts.push({ title: 'Too many colours compete', detail: 'A restrained palette makes colour feel intentional. Change your angle, or reduce saturation of the distracting ones.' });
  return { score, strengths, lifts: lifts.slice(0, 3), parts: { clarity, light: lightS, colour: colourS, depth, structure } };
}

/* ------------------------------------------------------ scoring etc. */
export function evaluate(m, { goals = [], settings = null } = {}) {
  const goalIds = goals.map((g) => g.id), merged = mergeGoals(goals), base = baseFindings(m, settings, goalIds), techs = techniques(m, settings);
  const findings = base.map((f) => {
    const rel = merged.w[f.id] ?? 1, emb = f.state === 'issue' ? merged.embrace[f.id] : null;
    const out = { ...f, relevance: rel };
    if (emb) { out.state = 'intent'; out.intent = emb; out.effective = 0; } else out.effective = f.state === 'issue' ? f.severity * rel : 0;
    return out;
  });
  const used = new Set(techs.filter((t) => t.used).map((t) => t.id));
  const groups = {}; for (const g of Object.keys(GROUP_CAP)) groups[g] = 0;
  for (const f of findings) if (f.state === 'issue') groups[f.group] += f.effective * f.weight;
  const scores = {};
  for (const g of Object.keys(GROUP_CAP)) scores[g] = Math.round(clamp(100 - groups[g] * 100 / GROUP_CAP[g], 5, 100));
  const imp = impactScore(m, used, techs);
  scores.impact = imp.score;
  // An absence of faults is only half of a good photograph, so the fault score and the impact score each count for half.
  const tech = scores.light * 0.28 + scores.focus * 0.3 + scores.comp * 0.3 + scores.colour * 0.12, worst = Math.min(scores.light, scores.focus);
  const overall = Math.round(clamp(tech * 0.5 + imp.score * 0.5 - 0.45 * Math.max(0, 70 - worst), 5, 96));
  // goal match: same penalties with the goal's weights, plus credit for the techniques that goal expects
  let goalMatch = null, expected = [];
  if (goals.length) {
    const pen = findings.filter((f) => f.state === 'issue').reduce((a, f) => a + f.effective * f.weight, 0), credit = merged.expects.filter((e) => used.has(e)).length;
    expected = merged.expects.map((id) => ({ id, label: TECH[id]?.label ?? id, used: used.has(id) }));
    goalMatch = Math.round(clamp(100 - pen * 1.15 + (merged.expects.length ? (credit / merged.expects.length) * 10 - 5 : 0) + findings.filter((f) => f.state === 'intent').length * 2, 5, 98));
  }
  const order = findings.filter((f) => f.state === 'issue' && f.effective > 0.05).sort((a, b) => b.effective * b.weight - a.effective * a.weight);
  const intents = findings.filter((f) => f.state === 'intent');
  return { findings, techniques: techs, scores, overall, strengths: imp.strengths, lifts: imp.lifts, histogram: m.impact?.histogram ?? null, goalMatch, expected, fixFirst: order.slice(0, 3), intents, tips: merged.tips, focus: focusState(m), placement: placement(m), notMeasured: NOT_MEASURED };
}
