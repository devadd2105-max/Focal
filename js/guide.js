// Teaching content shown next to the measurements: starting settings, modes, metering, white balance,
// histogram shapes, and questions that train the eye. Figures are common starting points from
// photography guides, not rules. Everything here is plain data so it is easy to check and edit.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SITUATIONS = [
  { what: 'Portrait, soft background', mode: 'Aperture priority', ap: 'f/1.4 to f/2.8', sh: '1/200 s or faster', iso: '100 to 400', note: 'Focus on the nearest eye. Spot or centre-weighted metering keeps the face right.' },
  { what: 'Landscape, everything sharp', mode: 'Aperture priority', ap: 'f/8 to f/11', sh: 'any, on a tripod', iso: '100', note: 'Evaluative metering. Past f/16 diffraction softens detail.' },
  { what: 'Street', mode: 'Aperture priority', ap: 'f/5.6 to f/8', sh: '1/250 s or faster', iso: 'Auto, up to 3200', note: 'Continuous autofocus. Pre-focus on the spot where the action will be.' },
  { what: 'Night, handheld', mode: 'Manual or aperture priority', ap: 'f/1.8 to f/2.8', sh: '1/60 s or faster', iso: '3200 to 6400', note: 'Brace yourself on a wall. Expose for the lights so they do not blow out.' },
  { what: 'Night or stars, tripod', mode: 'Manual', ap: 'f/1.4 to f/2.8', sh: 'about 500 ÷ focal length, or less', iso: '1600 to 6400', note: 'The 500 rule is only a ballpark and tends to be too long on high-resolution sensors, so shorten it if stars trail. Manual focus, and a 2-second timer or remote.' },
  { what: 'Interiors and real estate', mode: 'Manual or aperture priority', ap: 'f/8 to f/11', sh: 'any, on a tripod', iso: '100 to 400', note: 'Wide lens, camera level and at about waist height so verticals stay straight. Bracket exposures so the windows are not blown out.' },
  { what: 'Food', mode: 'Aperture priority', ap: 'f/2.8 to f/5.6', sh: 'any, on a tripod', iso: '100 to 400', note: 'Light from the side or behind, from a window, with a white card opposite to fill the shadows. Keep the background simple.' },
  { what: 'Underwater', mode: 'Manual', ap: 'f/8 to f/11', sh: '1/125 s', iso: '100 to 400', note: 'Red light vanishes within a metre or so, so get very close and add a strobe or a red filter. Slightly underexpose bright reds.' },
  { what: 'Moving subject', mode: 'Shutter priority', ap: 'camera picks', sh: '1/500 to 1/2000 s or faster', iso: 'Auto', note: 'Walking people need about 1/250 s. Running or flying subjects need 1/1000 s or more.' },
  { what: 'Silky water', mode: 'Manual', ap: 'f/11 to f/16', sh: '1/4 to 2 s', iso: '100', note: 'Needs a tripod, and often a neutral-density filter in daylight.' },
];

export const MODES = [
  ['Manual (M)', 'You set aperture, shutter and ISO. Best when the light is steady, or for night and studio work.'],
  ['Aperture priority (A or Av)', 'You set the aperture, the camera picks the shutter. The favourite for portraits, landscapes and travel.'],
  ['Shutter priority (S or Tv)', 'You set the shutter, the camera picks the aperture. Use it to freeze or blur movement.'],
  ['Program (P)', 'The camera picks both. A safe starting point when you need to shoot quickly.'],
];

export const METERING = [
  ['Evaluative or matrix', 'Reads the whole scene. The default, and right for most photos.'],
  ['Centre-weighted', 'Favours the middle of the frame. Handy for portraits with a steady background.'],
  ['Partial', 'Reads a larger circle in the centre. Use it when the subject is backlit.'],
  ['Spot', 'Reads one small point. Use it when the subject is much brighter or darker than the scene, such as a stage or a moon.'],
];

export const WB = [
  ['Auto', 'Fine most of the time, but scenes dominated by one colour can fool it.'],
  ['Daylight', 'Neutral for direct sun.'],
  ['Cloudy and shade', 'Warm the picture up to offset cool, blue light.'],
  ['Tungsten', 'Cools orange indoor bulbs.'],
  ['Fluorescent', 'Removes the green cast of tube lights.'],
  ['Custom', 'Set from a white or grey card for exact colour.'],
];

export const HIST = {
  balanced: 'A well-exposed picture usually rises gently from the left, peaks in the middle and falls away to the right, with a full range of tones.',
  under: 'Piled up on the left: the picture is too dark. Brighten it with more light, a wider aperture, a slower shutter or a higher ISO.',
  over: 'Piled up on the right: the picture is too bright. Darken it with a smaller aperture, a faster shutter or a lower ISO.',
  dull: 'A narrow hump in the middle: the picture is flat. Add contrast, use more directional light, or look for a scene with real darks and brights.',
  contrast: 'Heavy at both ends with a gap between: high contrast. Good for drama. Watch for lost detail at both ends.',
  lowkey: 'Mostly dark tones. Works for night or moody pictures when a few bright accents carry the eye.',
};

export const EYE = [
  'What made you stop? Say it in one sentence before you shoot.',
  'What is the star of the photo? If you cannot find one, move until you can.',
  'What can you take out? Step closer, change angle or wait until something leaves the frame.',
  'Where does the light come from, and what does it reveal? Look at the shadows.',
  'What is at the edges? Scan all four sides for bright or busy distractions.',
  'Is there a moment to wait for? A gesture, a step, a bird lifting off, a change in the light.',
  'Where will the eye go first, and then second? Faces, eyes, bright and warm areas pull hardest.',
  'Is there a near layer, a middle and a far one? Something close to the lens gives a wide scene an entrance.',
  'Would you call someone over to see it? Sharp and well exposed is only the entry ticket.',
];

export function histogramCard(h) {
  if (!h) return '';
  return `<div class="setcard"><h4>Histogram shape: ${esc(h.label)}</h4><p class="srcnote">${esc(h.note)}</p><p class="srcnote">${esc(HIST[h.id] || HIST.balanced)}</p></div>`;
}

export function playbookHtml() {
  const cards = SITUATIONS.map((x) => `<li class="sit"><b>${esc(x.what)}</b><span class="vals"><i>${esc(x.mode)}</i><i>${esc(x.ap)}</i><i>${esc(x.sh)}</i><i>ISO ${esc(x.iso)}</i></span><span class="srcnote">${esc(x.note)}</span></li>`).join('');
  const li = (a) => a.map(([k, v]) => `<li><b>${esc(k)}.</b> ${esc(v)}</li>`).join('');
  return `<div class="setcard playbook"><h4>Starting settings by situation</h4>
  <p class="srcnote">Use these as a launch pad, then adjust for your light and your idea. Aperture sets how much is in focus, shutter speed sets how movement looks, ISO sets how much noise you accept.</p>
  <ul class="sits">${cards}</ul>
  <details><summary>Shooting modes</summary><ul class="tips">${li(MODES)}</ul></details>
  <details><summary>Metering modes</summary><ul class="tips">${li(METERING)}</ul></details>
  <details><summary>White balance presets</summary><ul class="tips">${li(WB)}</ul></details>
  <details><summary>Handheld shutter speed</summary><p class="srcnote">Keep the shutter at least 1 over your focal length (1/50 s at 50 mm). On a crop-sensor camera use the 35 mm equivalent, and a stabilised lens can buy 3 to 5 stops. Moving subjects need a faster shutter whatever the focal length.</p></details></div>`;
}

export function eyeCard() {
  return `<div class="setcard"><h4>Train your eye</h4><p class="srcnote">Software can measure light, sharpness and layout. It cannot see feeling, story or a moment. These questions are for you.</p><ol class="eye">${EYE.map((q) => `<li>${esc(q)}</li>`).join('')}</ol></div>`;
}

export function workingCard(r) {
  const li = (a, cls) => a.map((x) => `<li class="${cls}"><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></li>`).join('');
  if (!r.strengths.length && !r.lifts.length) return '';
  return `<div class="setcard working"><h4>What gives it impact</h4>${r.strengths.length ? `<ul class="wlist">${li(r.strengths, 'yes')}</ul>` : '<p class="srcnote">Nothing in this picture stands out yet as a strength.</p>'}${r.lifts.length ? `<h4 class="lift">To lift it</h4><ul class="wlist">${li(r.lifts, 'up')}</ul>` : ''}</div>`;
}
