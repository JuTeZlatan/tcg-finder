import { useCallback, useEffect, useState } from 'react';

// Charge une donnée asynchrone. Le résultat est rattaché à la clé des dépendances :
// tant que la réponse pour la clé courante n'est pas arrivée, on est « en chargement ».
export function useAsync(fn, deps) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...deps, attempt]);
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => alive && setState({ key, data, error: null }),
      (error) => alive && setState({ key, data: null, error }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const current = state.key === key;
  return { loading: !current, data: current ? state.data : null, error: current ? state.error : null, retry };
}
