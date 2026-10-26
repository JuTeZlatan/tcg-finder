// Toutes les cartes d'un personnage (Pokémon, champion, archétype…), de la plus récente à la plus ancienne.
import { Stack, useLocalSearchParams } from 'expo-router';
import { getTcg, dataLang } from '../../../../../api';
import { useCardLang } from '../../../../../lib/cardLang';
import CardGrid from '../../../../../components/CardGrid';

export default function CharacterScreen() {
  const { tcg: tcgId, charId, name } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  const lang = dataLang(tcg, useCardLang().cardLang);
  return (
    <>
      <Stack.Screen options={{ title: name || charId }} />
      <CardGrid tcg={tcg} lang={lang} load={() => tcg.getCharacterCards(charId, lang)} deps={[tcg.id, charId, lang]} />
    </>
  );
}
