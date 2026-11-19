import { analyze } from '../js/analyze.js';
import * as S from '../js/scenes.js';
const row = (n, img) => { const t = performance.now(), m = analyze(img), ms = Math.round(performance.now() - t), hz = m.lines.horizon, v = m.lines.vanishing;
  console.log(n.padEnd(18), `${ms}ms`.padEnd(6), `tilt ${hz ? hz.angle.toFixed(2) : '-'}`.padEnd(11), `vp ${v ? v.x.toFixed(2) + ',' + v.y.toFixed(2) + ' n' + v.lines : '-'}`.padEnd(16), `symLR ${m.symmetry.lr.toFixed(2)}`.padEnd(11), `space ${m.space.largest.toFixed(2)}`.padEnd(11), `rep ${m.repeat.strength.toFixed(2)}`.padEnd(9), `frame ${m.frame.diff.toFixed(0)}/${m.frame.ringDarkShare.toFixed(2)}`.padEnd(14), `subj ${m.subject ? m.subject.cx.toFixed(2) + ',' + m.subject.cy.toFixed(2) + ' a' + m.subject.area.toFixed(3) : '-'}`.padEnd(20), `blobs ${m.blobs.length}`, `sharp ${m.sharp.p90.toFixed(1)}/${m.sharp.top.toFixed(1)}`, `noise ${m.noise.sigma?.toFixed(1)}`); };
for (const a of [0, 1.5, -3, 5, -8]) row('landscape ' + a, S.landscape({ angle: a }));
row('road', S.road()); row('road vp low', S.road({ vp: [0.3, 0.5] })); row('symmetric', S.symmetric()); row('minimal', S.minimal());
row('silhouette', S.silhouette()); row('archway', S.archway()); row('pattern', S.pattern()); row('lowkey', S.lowKey());
row('landscape noisy20', S.addNoise(S.landscape(), 20)); row('landscape blur3', S.blurImg(S.landscape(), 3)); row('landscape blur6', S.blurImg(S.landscape(), 6));
