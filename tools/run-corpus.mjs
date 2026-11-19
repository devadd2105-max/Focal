// Dev helper: runs the analysis on raw RGBA dumps of the photo corpus and prints a table.
import fs from 'node:fs';
import { analyze } from '../js/analyze.js';
const dir = process.argv[2] || '/tmp/focal-raw', idx = JSON.parse(fs.readFileSync(dir + '/index.json'));
const only = process.argv[3];
for (const [n, [w, h]] of Object.entries(idx)) {
  if (only && !n.match(only)) continue;
  const data = new Uint8ClampedArray(fs.readFileSync(`${dir}/${n}.rgba`));
  const t = performance.now(), m = analyze({ w, h, data }), ms = Math.round(performance.now() - t);
  const hz = m.lines.horizon;
  console.log(n.padEnd(14), `${w}x${h}`.padEnd(9), `${ms}ms`.padEnd(6),
    `med${m.light.median}`.padEnd(7), `ev${m.light.evMid.toFixed(1)}`.padEnd(7), `clipH${(m.light.clipHi * 100).toFixed(1)}`.padEnd(10), `clipL${(m.light.clipLo * 100).toFixed(1)}`.padEnd(10),
    `sharp${m.sharp.p90.toFixed(1)}`.padEnd(10), `noise${m.noise.sigma === null ? '-' : m.noise.sigma.toFixed(1)}/${m.noise.shadow === null ? '-' : m.noise.shadow.toFixed(1)}`.padEnd(14),
    `tilt${hz ? hz.angle.toFixed(1) : '-'}`.padEnd(8), `symLR${m.symmetry.lr.toFixed(2)}`.padEnd(10), `space${m.space.largest.toFixed(2)}`.padEnd(9),
    `warm${m.colour.warm.toFixed(2)}`.padEnd(9), `sub${m.subject ? m.subject.cx.toFixed(2) + ',' + m.subject.cy.toFixed(2) : '-'}`.padEnd(12), `blobs${m.blobs.length}`, m.colour.harmony);
}
