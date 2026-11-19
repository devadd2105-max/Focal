// What is the photographer trying to do? A goal changes how much each finding matters (weight),
// which "faults" are actually the point of the picture (embrace), and which techniques it
// should be using (expects). Matching is keyword based: it is a rule engine, not language understanding.

const faultsRuleBased = ['horizon', 'verticals', 'tangent', 'cut', 'placement', 'subject', 'small', 'balance', 'headroom', 'exposure', 'clipLo', 'clipHi', 'contrast', 'cast', 'saturation'];

export const GOALS = [
  { id: 'portrait', label: 'Portrait', words: ['portrait', 'headshot', 'selfie', 'face', 'people', 'person', 'model', 'wedding', 'graduation', 'family'],
    blurb: 'A person is the subject: eyes sharp, a clean background, room above the head.',
    w: { focus: 1.5, isolationFault: 1.8, headroom: 2, cut: 1.5, cast: 1.4, small: 1.2 }, expects: ['isolation', 'thirds'],
    tips: ['Focus on the nearest eye.', 'Leave a small gap above the head, not a big one.', 'A wide aperture (f/1.8–f/2.8) melts the background.'] },
  { id: 'landscape', label: 'Landscape', words: ['landscape', 'scenery', 'mountain', 'sea', 'ocean', 'beach', 'lake', 'valley', 'horizon', 'skyline', 'waterfall', 'field', 'forest'],
    blurb: 'A wide scene: level horizon, depth from foreground to background, sharp throughout.',
    w: { horizon: 1.6, focus: 1.2, noise: 1.1, tangent: 1.2 }, expects: ['layers', 'leadingLines', 'thirds'],
    tips: ['Put the horizon on a third line, not the middle.', 'Add something close to the camera for depth.', 'Stop down to f/8–f/11 for front-to-back sharpness.'] },
  { id: 'street', label: 'Street', words: ['street', 'candid', 'city', 'urban', 'crowd', 'documentary', 'photojournalism', 'market'],
    blurb: 'Moments in public places: energy and timing matter more than perfect geometry.',
    w: { horizon: 0.4, verticals: 0.5, tangent: 0.5, cut: 0.5, small: 0.5, placement: 0.7, cast: 0.6, noise: 0.6 }, embrace: { horizon: 'Tilt reads as energy in street work.', cut: 'Cropping people at the edge is part of the street look.', tangent: 'Busy edges are normal on the street.', small: 'Small figures in a big scene work well here.' }, expects: ['layers', 'frame'],
    tips: ['Layer foreground, subject and background.', 'Pre-focus and wait for the moment.'] },
  { id: 'architecture', label: 'Architecture', words: ['architecture', 'building', 'tower', 'bridge', 'interior', 'facade', 'church', 'temple', 'skyscraper', 'staircase', 'stairs', 'geometry'],
    blurb: 'Straight lines, strong geometry and symmetry; verticals should stand up straight.',
    w: { verticals: 1.8, horizon: 1.4, tangent: 1.2, balance: 1.2 }, expects: ['symmetry', 'leadingLines'],
    tips: ['Keep the camera level to stop verticals leaning.', 'Centre a symmetrical building on purpose.'] },
  { id: 'product', label: 'Product', words: ['product', 'packshot', 'ecommerce', 'e-commerce', 'catalogue', 'catalog', 'listing', 'item', 'gadget', 'jewellery', 'jewelry'],
    blurb: 'A clean, accurate picture of an object: even light, true colour, crisp edges.',
    w: { exposure: 1.4, cast: 1.8, focus: 1.5, clipHi: 1.4, small: 1.5, contrast: 1.0 }, embrace: { placement: 'A centred product is the standard.' }, expects: ['negativeSpace'],
    tips: ['Use a custom white balance so whites are white.', 'Keep the product at least a third of the frame.'] },
  { id: 'food', label: 'Food', words: ['food', 'meal', 'dish', 'cooking', 'dessert', 'coffee', 'drink', 'recipe', 'restaurant', 'cafe', 'café'],
    blurb: 'Appetising, warm and close, with a soft background.',
    w: { cast: 0.5, saturation: 0.5, focus: 1.3 }, embrace: { cast: 'Warm tones make food look good.', saturation: 'Rich colour is right for food.' }, expects: ['isolation', 'diagonals'],
    tips: ['Shoot from 45° or straight down.', 'Window light from the side or behind beats flash and front light, which flattens texture.', 'Keep the background and props simple.'] },
  { id: 'action', label: 'Action and sport', words: ['action', 'sport', 'sports', 'running', 'race', 'football', 'basketball', 'soccer', 'match', 'jump', 'fast', 'moving', 'motion', 'dance', 'taekwondo', 'swimming'],
    blurb: 'Freeze or show movement: shutter speed first, give the subject room to move into.',
    w: { focus: 1.4, shake: 1.8, noise: 0.5, horizon: 0.6, tangent: 0.7 }, embrace: { noise: 'Some noise is a fair price for a fast shutter.' }, expects: ['leadingRoom', 'isolation'],
    tips: ['Start at 1/1000 s for fast sport.', 'Leave space in the direction the subject is moving.'] },
  { id: 'night', label: 'Night and low light', words: ['night', 'low light', 'low-light', 'astro', 'stars', 'milky', 'neon', 'city lights', 'evening', 'dark scene'],
    blurb: 'Dark scenes with bright lights: shadows are fine, shake and noise are the enemies.',
    w: { shake: 1.6, noise: 0.7 }, embrace: { exposure: 'A dark frame is normal at night.', clipLo: 'Deep shadows are expected at night.', clipHi: 'Bright lights clip, and that is usually fine.', contrast: 'High contrast comes with night scenes.', cast: 'Artificial light brings colour casts.' }, expects: ['lowKey'],
    tips: ['Use a tripod or brace the camera.', 'Expose for the lights, not the dark.'] },
  { id: 'silhouette', label: 'Silhouette', words: ['silhouette', 'backlit', 'backlight', 'sunset', 'sunrise', 'golden hour', 'contre-jour', 'contre jour', 'shadow figure'],
    blurb: 'A dark shape against a bright sky: expose for the sky and let the subject go black.',
    w: { cast: 0.4 }, embrace: { exposure: 'Underexposing the subject is the point of a silhouette.', clipLo: 'Solid black shapes are what you want.', clipHi: 'A bright sun disc will clip, and that is normal.', contrast: 'Strong contrast makes a silhouette.', cast: 'A warm sky is the goal.' }, expects: ['silhouette', 'negativeSpace'],
    tips: ['Meter on the sky.', 'Pick a subject with a recognisable outline.'] },
  { id: 'minimalism', label: 'Minimalism', words: ['minimal', 'minimalism', 'minimalist', 'simple', 'clean', 'empty', 'negative space', 'sparse', 'lonely', 'lone'],
    blurb: 'One small element in lots of calm space.',
    w: { small: 0.2, contrast: 0.6, subject: 0.5 }, embrace: { small: 'A tiny subject in big space is minimalism.', contrast: 'Gentle tones suit a minimal image.' }, expects: ['negativeSpace', 'thirds'],
    tips: ['Put the subject on a third and leave the rest quiet.'] },
  { id: 'moody', label: 'Dark and moody', words: ['moody', 'dark', 'dramatic', 'low key', 'low-key', 'noir', 'gloomy', 'mysterious', 'cinematic', 'brooding'],
    blurb: 'Shadows carry the mood; highlights are used sparingly.',
    w: {}, embrace: { exposure: 'A dark exposure fits the mood you described.', clipLo: 'Deep shadows add drama.', contrast: 'Strong contrast suits a dramatic look.', cast: 'A cool or warm grade is part of the mood.' }, expects: ['lowKey'],
    tips: ['Light a small part of the subject and let the rest fall off.'] },
  { id: 'airy', label: 'Bright and airy', words: ['bright', 'airy', 'high key', 'high-key', 'light and airy', 'pastel', 'soft light', 'fresh', 'snow', 'white'],
    blurb: 'Light tones, soft contrast, clean whites.',
    w: {}, embrace: { exposure: 'A bright exposure suits the airy look.', contrast: 'Low contrast is part of the airy style.', clipHi: 'Slightly blown whites are tolerated in high-key work.' }, expects: ['highKey'],
    tips: ['Expose to the right, but watch the highlights overlay.'] },
  { id: 'warm', label: 'Warm mood', words: ['warm', 'cozy', 'cosy', 'golden', 'amber', 'tungsten'],
    blurb: 'Warm tones on purpose.', w: {}, embrace: { cast: 'The warm tint matches the mood you want.' }, expects: [], tips: [] },
  { id: 'cool', label: 'Cool mood', words: ['cool', 'cold', 'blue hour', 'icy', 'winter', 'moonlight', 'teal'],
    blurb: 'Cool tones on purpose.', w: {}, embrace: { cast: 'The cool tint matches the mood you want.' }, expects: [], tips: [] },
  { id: 'travel', label: 'Travel', words: ['travel', 'trip', 'holiday', 'vacation', 'tourist', 'landmark', 'souvenir', 'scenic'],
    blurb: 'A place and a feeling: clear subject, a sense of depth.',
    w: { horizon: 1.2 }, expects: ['layers', 'thirds'], tips: ['Include a person or a landmark for scale.'] },
  { id: 'nature', label: 'Wildlife and nature', words: ['wildlife', 'bird', 'animal', 'nature', 'flower', 'insect', 'plant', 'pet', 'dog', 'cat'],
    blurb: 'Living subjects: sharp eyes, soft background.',
    w: { focus: 1.5, isolationFault: 1.5, cut: 1.2, small: 0.7 }, expects: ['isolation'], tips: ['Fast shutter for anything that moves.', 'Get low, to the animal\'s eye level.', 'Show something fresh: a behaviour, a moment or a view people have not seen.'] },
  { id: 'macro', label: 'Macro', words: ['macro', 'close-up', 'close up', 'closeup', 'tiny', 'detail shot'],
    blurb: 'Very close: depth of field is razor thin, so what is sharp matters.',
    w: { focus: 1.5, cut: 0.6, isolationFault: 1.4 }, expects: ['isolation'], tips: ['Use a tripod and focus on the one part that matters.'] },
  { id: 'deliberate', label: 'Breaking the rules on purpose', words: ['break the rules', 'break rules', 'on purpose', 'deliberate', 'experimental', 'abstract', 'artistic', 'surreal', 'rule breaking', 'unconventional', 'dutch'],
    blurb: 'Composition rules are relaxed. Only technical problems (focus, noise) still count.',
    w: Object.fromEntries(faultsRuleBased.map((k) => [k, 0.25])), embrace: Object.fromEntries(faultsRuleBased.map((k) => [k, 'Rule broken, and you said that was deliberate.'])), expects: [],
    tips: ['Break one rule at a time so the picture still reads.'] },
];

export const GOAL_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g]));

/** Find the goals a free-text description points at. Returns { goals, matched, unknown }. */
export function parseIntent(text, picked = []) {
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9é\-\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const found = new Map();
  for (const id of picked) if (GOAL_BY_ID[id]) found.set(id, { goal: GOAL_BY_ID[id], via: 'chip' });
  for (const g of GOALS) for (const w of g.words) { if (t.includes(` ${w} `) || (w.length >= 5 && t.includes(` ${w}`)) ) { if (!found.has(g.id)) found.set(g.id, { goal: g, via: w }); break; } }
  const goals = [...found.values()];
  return { goals: goals.map((f) => f.goal), matched: goals.map((f) => ({ id: f.goal.id, label: f.goal.label, via: f.via })), unknown: t.trim().length > 3 && goals.length === 0 };
}

/** Combined view of several goals: weights multiply, embraces and expectations merge. */
export function mergeGoals(goals) {
  const w = {}, embrace = {}, expects = new Set(), tips = [];
  for (const g of goals) {
    for (const [k, v] of Object.entries(g.w || {})) w[k] = (w[k] ?? 1) * v;
    for (const [k, v] of Object.entries(g.embrace || {})) embrace[k] ??= { text: v, goal: g.label };
    for (const e of g.expects || []) expects.add(e);
    tips.push(...(g.tips || []).map((t) => ({ goal: g.label, text: t })));
  }
  return { w, embrace, expects: [...expects], tips };
}
