/**
 * Hebrew, English and Spanish must have the same keys (.claude/rules/i18n-rtl.md: add every
 * language in the same change). Hebrew may add `_two` plural forms (dual).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const load = (lang) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../apps/mobile/src/i18n/${lang}.json`, import.meta.url)), 'utf8'));
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const he = new Set(flat(load('he')));
const en = new Set(flat(load('en')));
const es = new Set(flat(load('es')));
const onlyHe = [...he].filter((k) => !en.has(k) && !k.endsWith('_two'));
const onlyEn = [...en].filter((k) => !he.has(k));
const missingEs = [...en].filter((k) => !es.has(k));
const extraEs = [...es].filter((k) => !en.has(k));
if (onlyHe.length || onlyEn.length || missingEs.length || extraEs.length) {
  console.error('Missing in en.json:', onlyHe, '\nMissing in he.json:', onlyEn);
  console.error('Missing in es.json:', missingEs, '\nOnly in es.json:', extraEs);
  process.exit(1);
}
console.log(`i18n: ${he.size} he keys, ${en.size} en keys, ${es.size} es keys, in step.`);
