import { Stack, useLocalSearchParams } from 'expo-router';
import { getTcg, dataLang } from '../../../../api';
import { useCardLang } from '../../../../lib/cardLang';
import CardGrid from '../../../../components/CardGrid';

export default function SearchScreen() {
  const { tcg: tcgId, q } = useLocalSearchParams();
  const tcg = getTcg(tcgId);
  const lang = dataLang(tcg, useCardLang().cardLang);
  return (
    <>
      <Stack.Screen options={{ title: `« ${q} »` }} />
      <CardGrid tcg={tcg} lang={lang} load={() => tcg.searchCards(q, lang)} deps={[tcg.id, q, lang]} />
    </>
  );
}
