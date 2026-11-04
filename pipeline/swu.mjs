// Star Wars: Unlimited. Anglais : catalogue et prix TCGplayer (via TCGCSV), prix Cardmarket (jeu 21).
// Français, allemand, italien, espagnol : base officielle de Fantasy Flight Games (starwarsunlimited.com, publique) :
// noms, textes et images des cartes, reliés aux cartes anglaises par extension + numéro (mêmes prix : une carte,
// plusieurs langues). Pas de version japonaise, chinoise ni coréenne publiée.
import { getJSON, normName, sleep, writeTcg, htmlToText, clean } from './lib.mjs';
import { buildTcgcsvGame } from './tcgcsvGame.mjs';

const OFFICIAL = 'https://admin.starwarsunlimited.com/api/card-list';
const PAGE = 100;
const LOCALES = ['fr', 'de', 'it', 'es'];

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

  for (const locale of LOCALES) await buildLocale(outDir, sets, locale);
}

async function buildLocale(outDir, sets, locale) {
  console.log(`Star Wars Unlimited (${locale})…`);
  const fr = await officialCards(locale);
  // Les promos d'une extension partagent son code et ses numéros (« 3/20 » contre « 003/252 ») : on relie par code,
  // numéro ET total imprimé ; sans total (variantes Hyperspace 285…), la carte de la série principale (plus grand total).
  const byExact = new Map();
  const byNumber = new Map();
  const setNames = new Map();
  for (const c of fr) {
    const code = c.expansion?.data?.attributes?.code;
    if (!code || c.cardNumber == null) continue;
    byExact.set(`${code}|${Number(c.cardNumber)}|${Number(c.cardCount)}`, c);
    const k = `${code}|${Number(c.cardNumber)}`;
    const prev = byNumber.get(k);
    if (!prev || Number(c.cardCount) > Number(prev.cardCount)) byNumber.set(k, c);
    const setName = c.expansion?.data?.attributes?.name;
    if (setName) setNames.set(code, setName);
  }
  const officialOf = (code, number) => {
    const [n, total] = String(number).split('/').map((v) => parseInt(v, 10));
    return total ? byExact.get(`${code}|${n}|${total}`) : byNumber.get(`${code}|${n}`);
  };
  let matched = 0;
  const frSets = sets.map((s) => {
    const code = String(s.id).replace(/-\d+$/, '');
    const cards = s.cards.map((card) => {
      const f = officialOf(code, card.number);
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
  console.log(`  swu/${locale} : ${matched}/${total} cartes avec leur version officielle dans cette langue`);
  await writeTcg(outDir, 'swu', locale, frSets);
}
