import fs from 'node:fs';
import { analyze } from '../js/analyze.js';
import { evaluate } from '../js/checks.js';
import { parseIntent } from '../js/intent.js';
const dir = process.env.RAW || '/tmp/focal-raw', idx = JSON.parse(fs.readFileSync(dir + '/index.json')), only = process.argv[2], goalText = process.argv[3] || '';
const settingsFor = { exif_portrait: { aperture: 1.8, shutter: 1 / 250, iso: 100, focal: 85, focal35: 85, ev: 0, wb: 'auto' }, exif_shaky: { aperture: 5.6, shutter: 1 / 15, iso: 800, focal: 200, focal35: 200, ev: 0, wb: 'auto' }, exif_nightiso: { aperture: 2.8, shutter: 1 / 30, iso: 12800, focal: 35, focal35: 35, ev: -1, wb: 'auto' }, exif_wb: { aperture: 8, shutter: 1 / 500, iso: 200, focal: 23, focal35: 35, ev: 0, wb: 'auto' } };
for (const [n, [w, h]] of Object.entries(idx)) {
  if (only && !n.match(only)) continue;
  const m = analyze({ w, h, data: new Uint8ClampedArray(fs.readFileSync(`${dir}/${n}.rgba`)) }), goals = parseIntent(goalText).goals, r = evaluate(m, { goals, settings: settingsFor[n] || null });
  console.log(`${n.padEnd(14)} overall ${String(r.overall).padStart(3)}  L${r.scores.light} F${r.scores.focus} C${r.scores.comp} K${r.scores.colour}${r.goalMatch != null ? '  goal ' + r.goalMatch : ''}  | ` + r.findings.filter((f) => f.state === 'issue').map((f) => `${f.id}:${f.severity.toFixed(2)}`).join(' ') + (r.intents.length ? '  intent: ' + r.intents.map((f) => f.id).join(',') : '') + '  | tech: ' + r.techniques.filter((t) => t.used).map((t) => t.id).join(','));
}
