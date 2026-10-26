// Jeu construit entièrement à partir du catalogue TCGplayer (via TCGCSV) : extensions, cartes, images, caractéristiques,
// prix TCGplayer, puis prix Cardmarket associés par code ou par nom (et proximité de prix entre versions).
// Utilisé pour Dragon Ball Super (Fusion World et Masters), en anglais.
import {
  sleep, clean, htmlToText, loadCardmarket, cardmarketBlock, cardmarketRef, buildProductIndex, matchByPrice,
  getUsdToEur, tcgcsvGroups, tcgcsvGroupProducts, tcgplayerBlock, tcgplayerRef, isFoilOnly, writeTcg, addSetImages,
} from './lib.mjs';

// Champs TCGplayer déjà affichés ailleurs (ou trop techniques).
const SKIP_FIELDS = new Set(['Number', 'Rarity', 'Description', 'UPC']);
const FIELD_KEYS = { CardType: 'type', Color: 'color', Power: 'power', Cost: 'cost' };

export async function buildTcgcsvGame(outDir, { id, label, categoryId, cardmarketGame, cmKey, cardKey, cmUrl }) {
  console.log(`${label}…`);
  const [fx, cm, groups] = await Promise.all([getUsdToEur(), loadCardmarket(cardmarketGame), tcgcsvGroups(categoryId)]);
  const index = buildProductIndex(cm.products, cmKey, (p) => p.idExpansion);

  const sets = [];
  for (const g of groups) {
    const products = (await tcgcsvGroupProducts(categoryId, g.groupId)).filter((p) => p.number); // sans le scellé
    await sleep(60);
    if (!products.length) continue;
    products.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.productId - b.productId);

    const cmMatch = matchByPrice({
      index,
      cards: products,
      keyOfCard: cardKey,
      refOfCard: (p) => (tcgplayerRef(p.prices) || 0) * fx || null,
      refOfProduct: (p) => cardmarketRef(cm.prices.get(p.idProduct)),
      minRatio: 0.3,
    });

    const cards = products.map((p) => {
      const ext = Object.fromEntries((p.extendedData || []).map((e) => [e.name, htmlToText(e.value)]));
      const extra = (p.extendedData || [])
        .filter((e) => !SKIP_FIELDS.has(e.name))
        .map((e) => [FIELD_KEYS[e.name] || e.displayName || e.name, htmlToText(e.value).replace(/;/g, ', ')]);
      const cmProduct = cmMatch.get(p);
      const prices = [
        cmProduct && cardmarketBlock(cm.prices.get(cmProduct.idProduct), null, { foil: isFoilOnly(p.prices) }),
        tcgplayerBlock(p.prices, p.url),
      ].filter(Boolean);
      // « Son Gohan : Future - FB11-032 (Alternate Art) » → « Son Gohan : Future (Alternate Art) »
      const name = p.name.replace(/\s+-\s+[A-Z0-9_]+-[A-Z0-9]+(?=\s*\(|\s*$)/i, '').trim();
      return {
        id: String(p.productId),
        name,
        number: p.number,
        subtitle: ext.Rarity,
        image: p.image,
        thumb: p.thumb,
        details: clean([['set', g.name], ['number', p.number], ['rarity', ext.Rarity], ...extra]),
        texts: ext.Description ? [{ titleKey: 'effect', body: ext.Description }] : [],
        prices,
        links: [
          { label: 'TCGplayer', url: p.url },
          { label: 'Cardmarket', url: cmUrl(name, p.number) },
        ],
      };
    });
    const date = (g.publishedOn || '').slice(0, 10);
    sets.push({ id: g.abbreviation || String(g.groupId), name: g.name, subtitle: `${g.abbreviation || ''}${date ? ` · ${date}` : ''}`, date, cards, tcgGroupId: g.groupId });
  }
  // Abréviations parfois partagées : on garantit des identifiants uniques.
  const seen = new Map();
  for (const s of sets) {
    const n = seen.get(s.id) || 0;
    seen.set(s.id, n + 1);
    if (n) s.id = `${s.id}-${n + 1}`;
  }
  sets.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  await addSetImages(sets, categoryId);
  await writeTcg(outDir, id, 'en', sets);
}
