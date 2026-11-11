// Reconnaissance d'une carte par son image seule : index publiés chaque jour par la collecte
// (pipeline/fingerprints.mjs › fpi/<jeu>/<langue>.bin et .json), téléchargés une fois puis gardés sur le téléphone,
// chargés dans le module natif card-vision qui y cherche chaque image filmée (événement onFrame › visual).
// Jeux préparés : ceux de la collection (sinon tous, sauf Magic dont l'index est bien plus lourd), dans la langue
// des cartes (une seule image par impression pour Magic et Yu-Gi-Oh!).
import { Directory, File, Paths } from 'expo-file-system';
import { available, loadIndex } from '../../modules/card-vision';
import { DATA_URL } from '../config';
import { TCGS, dataLang, getTcg } from '../api';

const REFRESH = 3 * 86400000; // index encore en cours de remplissage : rafraîchi tous les 3 jours
const SAME_IMAGES = new Set(['magic', 'yugioh']);
const HEAVY = new Set(['magic']); // seulement si la collection en contient
const metas = new Map(); // « jeu/langue » → { tcg, lang, cards: [[[id, extension, nom, numéro], …], …] }
const loading = new Map();

const dir = () => {
  const d = new Directory(Paths.document, 'fpi');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Un index : téléchargé s'il manque ou date de plus de 3 jours, puis chargé dans le module natif.
async function prepare(tcg, lang) {
  const name = `${tcg}/${lang}`;
  if (!loading.has(name)) {
    loading.set(name, (async () => {
      const base = `${tcg}-${lang}`;
      const bin = new File(dir(), `${base}.bin`);
      const meta = new File(dir(), `${base}.json`);
      const stale = !bin.exists || !meta.exists || Date.now() - (bin.modificationTime ?? 0) > REFRESH;
      if (stale && DATA_URL) {
        try {
          const json = await fetchJson(`${DATA_URL}/fpi/${tcg}/${lang}.json`);
          await File.downloadFileAsync(`${DATA_URL}/fpi/${tcg}/${lang}.bin`, bin, { idempotent: true });
          meta.write(JSON.stringify(json));
        } catch {
          // index pas encore publié ou réseau absent : l'ancien (s'il existe) sert encore
        }
      }
      if (!bin.exists || !meta.exists) return 0;
      const json = JSON.parse(await meta.text());
      const n = await loadIndex(name, bin.uri);
      metas.set(name, { tcg, lang, cards: json.cards });
      return n;
    })().catch(() => {
      loading.delete(name); // nouvel essai la fois suivante
      return 0;
    }));
  }
  return loading.get(name);
}

// Prépare les index utiles ; renvoie le nombre d'images prêtes (0 : reconnaissance par l'image indisponible).
export async function prepareVisualIndex(collectionGames, cardLang) {
  if (!available) return 0;
  const games = TCGS.filter((g) => (collectionGames.size ? collectionGames.has(g.id) : !HEAVY.has(g.id)));
  const counts = await Promise.all(games.map((g) => prepare(g.id, SAME_IMAGES.has(g.id) ? 'en' : dataLang(g, cardLang))));
  return counts.reduce((a, b) => a + (b || 0), 0);
}

// Meilleures images trouvées (onFrame › visual : [{ index, i, score }]) → cartes candidates, au format du scan
// (lib/scan.js › cand) : une image peut correspondre à plusieurs cartes (rééditions).
export function visualCandidates(visual, preferredLang) {
  const out = [];
  for (const v of visual || []) {
    const meta = metas.get(v.index);
    for (const [id, setId, name, number] of meta?.cards[v.i] || []) {
      const tcg = getTcg(meta.tcg);
      out.push({
        tcgId: meta.tcg, lang: SAME_IMAGES.has(meta.tcg) ? preferredLang : meta.lang, dataLang: SAME_IMAGES.has(meta.tcg) ? dataLang(tcg, preferredLang) : meta.lang,
        setId, id: String(id), name, number, image: null, setName: null, score: v.score, visual: v.score, why: 'image',
      });
    }
  }
  return out;
}

// Image et nom d'extension des premières candidates (l'index ne garde que l'essentiel).
export async function withImages(candidates, max = 4) {
  await Promise.all(candidates.slice(0, max).map(async (c) => {
    if (c.image) return;
    try {
      const card = await getTcg(c.tcgId).getCard(c.id, c.setId, c.dataLang ?? c.lang);
      c.image = card.image;
      c.setName = c.setName || card.setName;
    } catch {
      // fiche indisponible : la candidate reste sans image
    }
  }));
  return candidates;
}
