// Lecture du texte d'une carte photographiée, ciblée sur le cadre affiché à l'écran :
// 1. la photo est recadrée sur la carte (le décor autour ajoute du texte parasite) ;
// 2. la bande du bas (code imprimé : OP09-119, 004/084, SFD-051/221…) est agrandie et relue à part, car ce petit
//    texte est souvent manqué sur la photo entière ;
// 3. sans code trouvé, la photo entière est relue en secours (carte mal cadrée).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { File } from 'expo-file-system';
import { detectCodes } from './scanDetect';

// Image temporaire supprimée après lecture (la rafale en produit plusieurs par seconde).
export const discard = (uri) => {
  try {
    new File(uri).delete();
  } catch {
    // déjà supprimée
  }
};
const readAndDiscard = async (uri) => {
  try {
    return (await recognizeText(uri))?.text || '';
  } finally {
    discard(uri);
  }
};

const MARGIN = 0.08; // marge autour du cadre (carte un peu plus grande que le cadre)
const BOTTOM = 0.24; // part basse de la carte relue à part

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Rectangle du cadre (coordonnées de l'écran) reporté sur la photo, l'aperçu remplissant la vue (« cover »).
export function frameOnPhoto(photo, view, frame) {
  if (!photo?.width || !view?.width || !frame?.width) return null;
  const s = Math.max(view.width / photo.width, view.height / photo.height);
  const ox = (photo.width * s - view.width) / 2;
  const oy = (photo.height * s - view.height) / 2;
  const w = frame.width / s;
  const h = frame.height / s;
  const x = (frame.x + ox) / s - w * MARGIN;
  const y = (frame.y + oy) / s - h * MARGIN;
  const rect = { originX: clamp(x, 0, photo.width - 1), originY: clamp(y, 0, photo.height - 1) };
  rect.width = Math.round(clamp(w * (1 + 2 * MARGIN), 1, photo.width - rect.originX));
  rect.height = Math.round(clamp(h * (1 + 2 * MARGIN), 1, photo.height - rect.originY));
  rect.originX = Math.round(rect.originX);
  rect.originY = Math.round(rect.originY);
  return rect;
}

async function cropTo(uri, rect, width) {
  const ref = await ImageManipulator.manipulate(uri).crop(rect).resize({ width }).renderAsync();
  return (await ref.saveAsync({ compress: 0.92, format: SaveFormat.JPEG })).uri;
}

// photo : { uri, width, height } ; view, frame : tailles et position (écran) de l'aperçu et du cadre.
export async function readCard(photo, view, frame) {
  const texts = [];
  const rect = frameOnPhoto(photo, view, frame);
  if (rect) {
    try {
      const bottom = { ...rect, originY: Math.round(rect.originY + rect.height * (1 - BOTTOM)), height: Math.round(rect.height * BOTTOM) };
      // Code d'abord (bande du bas agrandie), puis la carte entière (nom, texte : départage des versions).
      texts.push(await readAndDiscard(await cropTo(photo.uri, bottom, 1600)));
      texts.push(await readAndDiscard(await cropTo(photo.uri, rect, 1100)));
    } catch {
      // recadrage impossible : lecture de la photo entière ci-dessous
    }
  }
  if (!detectCodes(texts.join('\n')).length) texts.push((await recognizeText(photo.uri))?.text || '');
  return texts.filter(Boolean).join('\n');
}
