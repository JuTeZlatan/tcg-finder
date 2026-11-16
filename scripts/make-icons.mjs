// Icônes intégrées à l'appli : vignettes des personnages (Pokémon, héros, archétypes…) et logos des extensions,
// regroupées en planches (assets/icons/*.webp) pour un affichage instantané, sans attendre le réseau.
// Lancé par scripts/build-apk.ps1 (ou : node --import ./scripts/node-app/register.mjs scripts/make-icons.mjs).
// Les listes viennent du code même de l'appli (src/api, exécuté dans Node) : mêmes images que celles affichées.
// Français et anglais (ou la seule langue d'un jeu) : les autres langues chargent leurs images en ligne.
// Cache des vignettes déjà faites : C:\tcgb-icons (rien n'est retéléchargé d'une compilation à l'autre).
import { mkdir, readdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from '../pipeline/node_modules/sharp/lib/index.js';
import { iconKey } from '../src/lib/iconKey.js';

process.env.EXPO_PUBLIC_DATA_URL ||= 'https://jutezlatan.github.io/tcg-finder';
const { TCGS } = await import('../src/api/index.js');

const OUT = 'assets/icons';
const CACHE = 'C:/tcgb-icons';
const SHEET = 1024;
// Vignette de personnage (carrée, haut de l'image) et logo d'extension (4:3, image entière).
const KINDS = {
  c: { w: 96, h: 96, fit: 'cover', position: 'top' },
  l: { w: 128, h: 96, fit: 'contain' },
  t: { w: 128, h: 96, fit: 'contain' }, // logos monochromes recolorés à l'affichage (symboles Magic)
};

await mkdir(CACHE, { recursive: true });
const exists = (p) => access(p).then(() => true, () => false);

// 1. Images à intégrer, dans l'ordre d'affichage (une planche couvre des icônes voisines à l'écran).
// Chaque icône est retrouvée par son adresse, mais aussi par le personnage ou l'extension (« onepiece|en|c|luffy ») :
// l'image d'un personnage (sa carte la plus récente) change à chaque nouvelle extension, l'icône intégrée reste.
const wanted = { c: [], l: [], t: [] };
const owners = new Map(); // adresse → clés de personnage / d'extension
const add = (kind, url, owner) => {
  if (!url || typeof url !== 'string' || !/^https?:/.test(url)) return;
  if (!owners.has(url)) {
    owners.set(url, []);
    wanted[kind].push(url);
  }
  owners.get(url).push(owner);
};
for (const tcg of TCGS) {
  const langs = tcg.languages.filter((l) => l === 'fr' || l === 'en');
  for (const lang of langs.length ? langs : tcg.languages.slice(0, 1)) {
    try {
      for (const s of await tcg.getSets(lang)) add(s.logoTint ? 't' : 'l', s.logo, `${tcg.id}|${lang}|s|${s.id}`);
      if (tcg.getCharacters) for (const c of await tcg.getCharacters(lang)) add('c', c.image, `${tcg.id}|${lang}|c|${c.id}`);
    } catch (e) {
      console.warn(`  ${tcg.id}/${lang} : listes indisponibles (${e.message})`);
    }
  }
}
console.log(`icônes : ${wanted.c.length} personnages, ${wanted.l.length + wanted.t.length} logos`);

// 2. Vignettes (cache), téléchargées 12 à la fois.
async function tile(kind, url) {
  const k = KINDS[kind];
  const file = `${CACHE}/${kind}-${createHash('sha1').update(url).digest('hex')}.png`;
  if (await exists(file)) return file;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'TCGFinder/1.0' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const img = /\.svg(\?|$)/i.test(url) ? sharp(buf, { density: 300 }) : sharp(buf);
      await img.resize(k.w, k.h, { fit: k.fit, position: k.position || 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(file);
      return file;
    } catch (e) {
      if (attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}
const done = { c: [], l: [], t: [] };
let failed = 0;
for (const kind of Object.keys(wanted)) {
  const list = wanted[kind];
  const files = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < list.length) {
      const i = next++;
      files[i] = await tile(kind, list[i]);
      if ((i + 1) % 1000 === 0) console.log(`  ${kind} : ${i + 1}/${list.length}`);
    }
  }));
  list.forEach((url, i) => (files[i] ? done[kind].push([url, files[i]]) : failed++));
}
if (failed) console.log(`  ${failed} image(s) introuvable(s) : chargées en ligne dans l'appli`);

// 3. Planches 1024×1024 (webp) et index : clé courte de l'adresse → [planche, colonne, ligne].
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const sheets = [];
const index = {};
for (const kind of Object.keys(done)) {
  const k = KINDS[kind];
  const cols = Math.floor(SHEET / k.w);
  const rows = Math.floor(SHEET / k.h);
  const per = cols * rows;
  for (let start = 0; start < done[kind].length; start += per) {
    const chunk = done[kind].slice(start, start + per);
    const n = sheets.length;
    const composite = chunk.map(([, file], i) => ({ input: file, left: (i % cols) * k.w, top: Math.floor(i / cols) * k.h }));
    await sharp({ create: { width: cols * k.w, height: Math.ceil(chunk.length / cols) * k.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composite).webp({ quality: 60, alphaQuality: 80 }).toFile(`${OUT}/${kind}${n}.webp`);
    sheets.push({ file: `${kind}${n}.webp`, w: cols * k.w, h: Math.ceil(chunk.length / cols) * k.h, cw: k.w, ch: k.h });
    chunk.forEach(([url], i) => {
      const cell = [n, i % cols, Math.floor(i / cols)];
      for (const key of [url, ...owners.get(url)]) index[iconKey(key)] = cell;
    });
  }
}
const total = (await Promise.all((await readdir(OUT)).map((f) => readFile(`${OUT}/${f}`).then((b) => b.length)))).reduce((a, b) => a + b, 0);
await writeFile('src/generated/icons.js', [
  '// Généré par scripts/make-icons.mjs : ne pas modifier à la main.',
  `export const SHEETS = [\n${sheets.map((s) => `  { src: require('../../assets/icons/${s.file}'), w: ${s.w}, h: ${s.h}, cw: ${s.cw}, ch: ${s.ch} },`).join('\n')}\n];`,
  `export const INDEX = ${JSON.stringify(index)};`,
  '',
].join('\n'));
console.log(`icônes : ${sheets.length} planches, ${(total / 1048576).toFixed(1)} Mo`);
