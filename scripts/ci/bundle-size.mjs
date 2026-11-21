/**
 * Compares the size of an `expo export` against scripts/ci/bundle-budget.json.
 * Fails when a part grows more than `tolerance` (10%) over its budget, so weight
 * removed in a cleanup does not creep back unnoticed. Writes a table to the
 * GitHub job summary when run in Actions.
 *
 *   node scripts/ci/bundle-size.mjs <export dir>
 *
 * After an intended growth, raise the numbers in bundle-budget.json in the same change.
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) throw new Error('usage: bundle-size.mjs <export dir>');
const budget = JSON.parse(readFileSync(fileURLToPath(new URL('./bundle-budget.json', import.meta.url)), 'utf8'));

const sizeOf = (p) => {
  const s = statSync(p);
  return s.isDirectory() ? readdirSync(p).reduce((sum, f) => sum + sizeOf(path.join(p, f)), 0) : s.size;
};
const jsOf = (platform) => sizeOf(path.join(dir, '_expo', 'static', 'js', platform));

const actual = { ios_js: jsOf('ios'), android_js: jsOf('android'), assets: sizeOf(path.join(dir, 'assets')) };
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
let failed = false;
const lines = ['| part | size | budget | change |', '| --- | --- | --- | --- |'];
for (const [part, size] of Object.entries(actual)) {
  const limit = budget[part];
  const change = ((size / limit - 1) * 100).toFixed(1);
  const over = size > limit * (1 + budget.tolerance);
  if (over) failed = true;
  lines.push(`| ${part} | ${mb(size)} | ${mb(limit)} | ${change}%${over ? ' ❌' : ''} |`);
}
const report = `### Mobile bundle size\n\n${lines.join('\n')}\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (failed) {
  console.error(`A part grew more than ${budget.tolerance * 100}% over its budget.`);
  process.exit(1);
}
