// « Master set » d'une extension : chaque version de chaque carte (normale, reverse, foil, 1re édition, motifs,
// tampons…) est une carte à trouver. Les versions viennent des mêmes lignes de prix que le choix de version
// à l'ajout (src/lib/finishes.js), pour que la liste et le choix correspondent.
import { finishesOf, finishLabel, storedFinish } from './finishes';

// card : { id, name, number, image } ; prices : lignes de prix de la carte (ou leur équivalent collecté).
// `finish` est la clé enregistrée en collection (null = version de référence), `label` son nom affiché.
export function versionsOfCard(card, prices) {
  const finishes = finishesOf(prices || []);
  if (finishes.length < 2) return [{ ...card, finish: null, label: null }];
  return finishes.map((f) => ({ ...card, finish: storedFinish(prices, f), label: finishLabel(prices, f) }));
}

export const versionKey = (cardId, finish) => `${cardId}|${finish || ''}`;
