import { useCallback, useEffect, useMemo, useState } from 'react';

// Charge une donnée asynchrone. Le résultat est rattaché à la clé des dépendances :
// tant que la réponse pour la clé courante n'est pas arrivée, on est « en chargement ».
// Donnée déjà en mémoire (fonction mémorisée par `memo`, déjà résolue : autre langue préchargée, écran déjà visité) :
// affichée immédiatement, sans passer par l'écran de chargement.
export function useAsync(fn, deps) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...deps, attempt]);
  const [state, setState] = useState({ key: null, data: null, error: null });

  const promise = useMemo(() => {
    try {
      const p = fn();
      return p && typeof p.then === 'function' ? p : Promise.resolve(p);
    } catch (e) {
      return Promise.reject(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let alive = true;
    promise.then(
      (data) => alive && setState({ key, data, error: null }),
      (error) => alive && setState({ key, data: null, error }),
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promise]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  if (state.key === key) return { loading: false, data: state.data, error: state.error, retry };
  if (promise?.settled) return { loading: false, data: promise.value, error: null, retry };
  return { loading: true, data: null, error: null, retry };
}
