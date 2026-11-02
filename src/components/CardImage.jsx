// Image de carte qui se retente toute seule : un téléchargement raté (réseau lent, serveur occupé) est relancé
// jusqu'à deux fois, au lieu de laisser une case vide jusqu'à la prochaine ouverture de l'écran.
import { useState } from 'react';
import { Image } from 'expo-image';

const RETRIES = 2;
const RETRY_DELAY = 1200;

export default function CardImage({ source, recyclingKey, ...props }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Image
      key={`${recyclingKey ?? source}-${attempt}`}
      source={source}
      recyclingKey={recyclingKey}
      cachePolicy="memory-disk"
      onError={() => attempt < RETRIES && setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAY)}
      {...props}
    />
  );
}
