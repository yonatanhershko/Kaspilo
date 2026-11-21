/**
 * Hebrew and English must have the same keys (.claude/rules/i18n-rtl.md: add both
 * languages in the same change). Hebrew may add `_two` plural forms (dual).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const load = (lang) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../apps/mobile/src/i18n/${lang}.json`, import.meta.url)), 'utf8'));
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const he = new Set(flat(load('he')));
const en = new Set(flat(load('en')));
const onlyHe = [...he].filter((k) => !en.has(k) && !k.endsWith('_two'));
const onlyEn = [...en].filter((k) => !he.has(k));
if (onlyHe.length || onlyEn.length) {
  console.error('Missing in en.json:', onlyHe, '\nMissing in he.json:', onlyEn);
  process.exit(1);
}
console.log(`i18n: ${he.size} he keys, ${en.size} en keys, in step.`);
