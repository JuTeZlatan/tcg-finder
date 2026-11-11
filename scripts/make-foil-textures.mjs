// Textures des effets brillants de la carte en 3D (src/components/CardViewer3D.jsx), générées une fois :
// node scripts/make-foil-textures.mjs → assets/foil/*.png. Images à transparence superposées à la carte (fondu
// normal : visibles sur tous les téléphones, contrairement aux modes de fusion des couleurs).
import { mkdir } from 'node:fs/promises';
import sharp from '../pipeline/node_modules/sharp/lib/index.js';

const OUT = 'assets/foil';
await mkdir(OUT, { recursive: true });

// Hasard reproductible (mêmes textures à chaque génération).
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function hsv(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [r * 255, g * 255, b * 255];
}

async function save(name, w, h, fn) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * w + x) * 4;
      buf[i] = Math.max(0, Math.min(255, r));
      buf[i + 1] = Math.max(0, Math.min(255, g));
      buf[i + 2] = Math.max(0, Math.min(255, b));
      buf[i + 3] = Math.max(0, Math.min(255, a));
    }
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(`${OUT}/${name}.png`);
}

// Points (paillettes, étoiles) dessinés sur une texture répétable.
function dots(w, h, count, { colors = false, stars = 0 } = {}) {
  const layer = new Float32Array(w * h * 4);
  const put = (x, y, rgb, a) => {
    const xx = ((Math.round(x) % w) + w) % w;
    const yy = ((Math.round(y) % h) + h) % h;
    const i = (yy * w + xx) * 4;
    const k = a * (1 - layer[i + 3]);
    for (let c = 0; c < 3; c++) layer[i + c] = (layer[i + c] * layer[i + 3] + rgb[c] * k) / Math.max(1e-6, layer[i + 3] + k);
    layer[i + 3] += k;
  };
  for (let n = 0; n < count; n++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.6 + rnd() ** 3 * 2.2;
    const rgb = colors && rnd() < 0.55 ? hsv(rnd(), 0.6, 1) : [255, 255, 255];
    const a = 0.45 + rnd() * 0.55;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= r + 0.5) put(x + dx, y + dy, rgb, a * Math.max(0, Math.min(1, r + 0.5 - d)));
    }
  }
  // Éclats en croix (4 branches) : reflets les plus vifs.
  for (let n = 0; n < stars; n++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 4 + rnd() * 7;
    for (let k = -len; k <= len; k++) {
      const a = 0.95 * (1 - Math.abs(k) / (len + 1));
      put(x + k, y, [255, 255, 255], a);
      put(x, y + k, [255, 255, 255], a);
    }
  }
  return (x, y) => {
    const i = (y * w + x) * 4;
    return [layer[i], layer[i + 1], layer[i + 2], layer[i + 3] * 255];
  };
}

// Paillettes (reverse, foil, texturée) : points blancs et colorés, quelques éclats.
await save('sparkle', 256, 256, dots(256, 256, 900, { colors: true, stars: 14 }));
// Étoiles (galaxy foil Magic) : points fins et nombreux éclats.
await save('stars', 256, 256, dots(256, 256, 500, { stars: 40 }));
// Arc-en-ciel en bandes diagonales (film holographique), deux cycles de couleurs, bandes plus vives.
await save('rainbow', 512, 512, (x, y) => {
  const t = (x + y * 0.75) / 512;
  const [r, g, b] = hsv((t * 2) % 1, 0.72, 1);
  const band = 0.5 + 0.5 * Math.sin(t * Math.PI * 10);
  return [r, g, b, 120 + 135 * band];
});
// « Cosmos » (holo du Set de base Pokémon) : taches rondes irisées qui se chevauchent.
{
  const w = 256;
  const spots = Array.from({ length: 70 }, () => ({ x: rnd() * w, y: rnd() * w, r: 6 + rnd() * 22, h: rnd() }));
  await save('cosmos', w, w, (x, y) => {
    let a = 0;
    let col = [0, 0, 0];
    for (const s of spots) {
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) {
        const d = Math.hypot(x - s.x - ox, y - s.y - oy);
        if (d < s.r) {
          const k = (1 - d / s.r) * 0.9;
          const c = hsv((s.h + d / 60) % 1, 0.65, 1);
          col = col.map((v, i) => v * (1 - k) + c[i] * k);
          a = Math.max(a, k);
        }
      }
    }
    return [...col, a * 230];
  });
}
// Lignes fines en diagonale (relief des cartes texturées, etched).
await save('lines', 64, 64, (x, y) => {
  const v = (x + y) % 6;
  return [255, 255, 255, v === 0 ? 150 : v === 1 ? 60 : 0];
});
// Or et argent métallisés : bandes claires et sombres en diagonale.
for (const [name, light, dark] of [['gold', [255, 226, 130], [176, 120, 30]], ['silver', [245, 248, 255], [130, 140, 160]]]) {
  await save(name, 512, 512, (x, y) => {
    const t = 0.5 + 0.5 * Math.sin(((x + y * 0.6) / 512) * Math.PI * 6);
    return [0, 1, 2].map((c) => dark[c] + (light[c] - dark[c]) * t).concat(150 + 90 * t);
  });
}
// Reflet de lumière : tache blanche ronde au bord adouci.
await save('glare', 256, 256, (x, y) => {
  const d = Math.hypot(x - 128, y - 128) / 128;
  return [255, 255, 255, Math.max(0, 1 - d) ** 1.6 * 235];
});
console.log('textures écrites dans', OUT);
