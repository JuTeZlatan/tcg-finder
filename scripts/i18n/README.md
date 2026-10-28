# Traductions de l'interface

Les textes sont écrits en français dans le code et passent par `t('…')` / `plural(n, '…', '…')` (src/lib/i18n.js).
Les traductions sont dans `src/translations/<langue>.js`, rangées par texte français.

- `node scripts/i18n/wrap.cjs . <fichiers…> [--dry]` : fait passer les textes affichés d'écrans par `t()` (à relire).
- `node scripts/i18n/extract.cjs . > keys.json` : liste tous les textes à traduire.
- `node scripts/i18n/check.mjs . keys.json en de es it pt zh` : signale les traductions manquantes ou mal recopiées.

Un texte absent d'un dictionnaire s'affiche en français.
