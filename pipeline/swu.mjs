// Star Wars: Unlimited. Anglais : catalogue et prix TCGplayer (via TCGCSV), prix Cardmarket (jeu 21).
// Français : base officielle de Fantasy Flight Games (starwarsunlimited.com, publique) : noms, textes et images
// des cartes françaises, reliés aux cartes anglaises par extension + numéro (mêmes prix : une carte, plusieurs langues).
// Pas de version japonaise ni chinoise publiée.
import { getJSON, normName, sleep, writeTcg, htmlToText, clean } from './lib.mjs';
import { buildTcgcsvGame } from './tcgcsvGame.mjs';

const OFFICIAL = 'https://admin.starwarsunlimited.com/api/card-list';
const PAGE = 100;

// « Security Complex // Experience Token » et mentions entre parenthèses retirées : clé de nom commune.
const baseName = (s) => normName(String(s).replace(/\s*\/\/.*$/, '').replace(/\s*\([^)]*\)/g, ''));
const cmUrl = (name) => `https://www.cardmarket.com/fr/StarWarsUnlimited/Products/Search?searchString=${encodeURIComponent(name.replace(/\s*\([^)]*\)/g, ''))}`;

// Toutes les cartes officielles d'une langue (variantes comprises), page par page.
async function officialCards(locale) {
  const out = [];
  for (let page = 1; ; page++) {
    const url = `${OFFICIAL}?locale=${locale}&pagination%5Bpage%5D=${page}&pagination%5BpageSize%5D=${PAGE}`;
    const d = await getJSON(url);
    out.push(...d.data.map((x) => x.attributes));
    if (page >= d.meta.pagination.pageCount) break;
    await sleep(150);
  }
  return out;
}

const imageOf = (c) => {
  const f = c.artFront?.data?.attributes;
  return f?.formats?.card?.url || f?.url || null;
};

export async function build(outDir) {
  const sets = await buildTcgcsvGame(outDir, {
    id: 'swu',
    label: 'Star Wars Unlimited',
    categoryId: 79,
    cardmarketGame: 21,
    cmKey: (p) => baseName(p.name),
    cardKey: (p) => baseName(p.name),
    cmUrl,
  });

  console.log('Star Wars Unlimited (français)…');
  const fr = await officialCards('fr');
  const byKey = new Map();
  const setNames = new Map();
  for (const c of fr) {
    const code = c.expansion?.data?.attributes?.code;
    if (!code || c.cardNumber == null) continue;
    byKey.set(`${code}|${Number(c.cardNumber)}`, c);
    const setName = c.expansion?.data?.attributes?.name;
    if (setName) setNames.set(code, setName);
  }
  let matched = 0;
  const frSets = sets.map((s) => {
    const code = String(s.id).replace(/-\d+$/, '');
    const cards = s.cards.map((card) => {
      const f = byKey.get(`${code}|${parseInt(card.number, 10)}`);
      if (!f) return { ...card };
      matched++;
      // Mention de version gardée (« (Hyperspace) », « (Showcase) »…).
      const tag = card.name.match(/\s*\([^)]*\)\s*$/)?.[0] || '';
      const name = `${f.title}${f.subtitle ? ` - ${f.subtitle}` : ''}${tag}`;
      const texts = clean([
        ['effect', f.text && htmlToText(f.text)],
        ['deploy', f.deployBox && htmlToText(f.deployBox)],
        ['epic', f.epicAction && htmlToText(f.epicAction)],
      ]).map(([titleKey, body]) => ({ titleKey, body }));
      return { ...card, name, nameEn: card.name, image: imageOf(f) || card.image, thumb: imageOf(f) || card.thumb, texts: texts.length ? texts : card.texts };
    });
    return { ...s, name: setNames.get(code) || s.name, cards };
  });
  const total = sets.reduce((n, s) => n + s.cards.length, 0);
  console.log(`  swu/fr : ${matched}/${total} cartes avec leur version française officielle`);
  await writeTcg(outDir, 'swu', 'fr', frSets);
}
