// Exécuter le code de l'appli (src/) dans Node, au moment de la compilation : imports sans extension complétés,
// modules natifs (Expo, React Native) et données intégrées remplacés par des équivalents Node (./stubs).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STUBS = new URL('./stubs/', import.meta.url);
export async function resolve(specifier, context, next) {
  if (/^(expo-|react-native|@react-native|@expo\/)/.test(specifier)) {
    return { url: new URL('native.mjs', STUBS).href, shortCircuit: true };
  }
  // Modules de l'appli non installés (collecte sur GitHub, sans les dépendances de l'appli) : remplaçants vides.
  if (/^(react$|firebase\/|@infinitered\/)/.test(specifier)) {
    try {
      return await next(specifier, context);
    } catch {
      return { url: new URL('missing.mjs', STUBS).href, shortCircuit: true };
    }
  }
  if (/bundledData$/.test(specifier)) return { url: new URL('bundledData.mjs', STUBS).href, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of ['', '.js', '.jsx', '/index.js']) {
      if (existsSync(base + ext) && (ext || /\.(m?js|jsx|json)$/.test(base))) {
        return { url: pathToFileURL(base + ext).href, format: 'module', shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.includes('/src/') && /\.(js|jsx)$/.test(url)) return { ...(await next(url, { ...context, format: 'module' })), format: 'module' };
  return next(url, context);
}
