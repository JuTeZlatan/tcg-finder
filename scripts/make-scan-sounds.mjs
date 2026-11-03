// Génère les sons du scan (assets/sounds/scan-*.wav), de plus en plus « riches » selon la valeur de la carte :
//   low  (< 1 €)     : petit « tic » discret ;
//   mid  (1 à 10 €)  : double tintement de pièce ;
//   high (≥ 10 €)    : arpège de cloches scintillant (trésor).
// Sons de synthèse (pas d'enregistrement), mono 16 bits. Usage : node scripts/make-scan-sounds.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const RATE = 22050;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const buffer = (seconds) => new Float64Array(Math.round(seconds * RATE));

// Note de cloche : fondamentale + partiels inharmoniques, attaque courte, décroissance exponentielle.
function bell(out, start, freq, length, amp, partials = [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
  const s0 = Math.round(start * RATE);
  const n = Math.round(length * RATE);
  for (let i = 0; i < n && s0 + i < out.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * (4.5 / length));
    let v = 0;
    for (const [mult, a] of partials) v += a * Math.sin(2 * Math.PI * freq * mult * t);
    out[s0 + i] += amp * env * v;
  }
}

function low() {
  const out = buffer(0.12);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const f = 760 - 1800 * t; // léger glissé vers le bas
    out[i] = 0.32 * Math.min(1, t / 0.003) * Math.exp(-t * 38) * Math.sin(2 * Math.PI * f * t);
  }
  return out;
}

function mid() {
  const out = buffer(0.55);
  bell(out, 0, 988, 0.32, 0.38); // si
  bell(out, 0.1, 1319, 0.42, 0.42); // mi
  return out;
}

function high() {
  const out = buffer(1.35);
  [1047, 1319, 1568, 2093].forEach((f, k) => bell(out, k * 0.085, f, 0.9, 0.3)); // do mi sol do
  bell(out, 0.34, 2637, 1.0, 0.22); // mi aigu tenu
  // Scintillement : petites étincelles aiguës aléatoires (graine fixe : même son à chaque génération).
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 16; k++) bell(out, 0.3 + rand() * 0.75, 3000 + rand() * 2500, 0.12, 0.06, [[1, 1]]);
  // Normalisation douce
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return out.map((v) => (v / peak) * 0.8);
}

await mkdir('assets/sounds', { recursive: true });
for (const [name, make] of Object.entries({ low, mid, high })) {
  await writeFile(`assets/sounds/scan-${name}.wav`, wav(make()));
  console.log(`assets/sounds/scan-${name}.wav`);
}
