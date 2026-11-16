// Équivalents vides des modules natifs : pas de cache disque ni d'interface dans Node.
export class Directory { constructor() { this.exists = false; } create() {} }
export class File { constructor() { this.exists = false; } write() {} async text() { throw new Error('absent'); } }
export const Paths = { cache: '', document: '' };
export const Asset = { loadAsync: async () => { throw new Error('absent'); } };
export const Platform = { OS: 'android', select: (o) => o.android ?? o.default };
export const NativeModules = {};
const storage = new Map();
export default { getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); }, removeItem: async (k) => { storage.delete(k); } };
export const getLocales = () => [{ languageCode: 'fr' }];
export const GoogleSignin = {};
export const ImageManipulator = {};
export const SaveFormat = {};
export const Vibration = { vibrate() {} };
export const createAudioPlayer = () => ({});
export const setAudioModeAsync = async () => {};
export const router = {};
