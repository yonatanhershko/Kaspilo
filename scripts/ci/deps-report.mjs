/**
 * Dependency report, on every CI run (owner 2026-11-21: nothing updates by itself; the
 * owner sees why each update exists and decides). Writes Markdown (Hebrew) to stdout
 * and to the GitHub job summary:
 *
 *   חובה      Expo SDK mismatches (`expo install --check`) and high / critical
 *             vulnerabilities in packages the apps run.
 *   מומלץ     moderate / low vulnerabilities in packages the apps run, and patch / minor
 *             updates of runtime packages.
 *   לא דחוף   major versions, dev-only tools, vulnerabilities only in dev tools.
 *
 * Read only: changes nothing. Run after `npm ci`:
 *   node scripts/ci/deps-report.mjs                  report; a "must" item is a warning
 *   node scripts/ci/deps-report.mjs --fail-on-must   same, but exits 1 on any "must" item (main)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const run = (cmd, args, cwd = root) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const json = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

// Packages that move with the Expo SDK: only `npx expo install --fix` / an SDK upgrade.
const expoManaged = (name) =>
  /^(expo|expo-.*|@expo\/.*|@expo-google-fonts\/.*|react|react-dom|react-native|react-native-.*|@react-native\/.*|@react-native-.*\/.*|nativewind)$/.test(
    name,
  );

const workspaceDir = (dependent) =>
  ['apps', 'packages'].map((d) => `${root}/${d}/${dependent}`).find((p) => existsSync(`${p}/package.json`)) ?? root;
const isDev = (name, dependent) => {
  const pkg = json(readFileSync(`${workspaceDir(dependent)}/package.json`, 'utf8'), {});
  return !!pkg.devDependencies?.[name] && !pkg.dependencies?.[name];
};

const repoCache = new Map();
function changesLink(name) {
  if (!repoCache.has(name)) {
    const r = run('npm', ['view', name, 'repository.url']);
    const url = (r.stdout || '').trim().replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:/, 'https:');
    repoCache.set(name, url.includes('github.com') ? `${url}/releases` : `https://www.npmjs.com/package/${name}?activeTab=versions`);
  }
  return repoCache.get(name);
}

const kind = (from, to) => {
  const [a, b] = [from, to].map((v) => v.split('.').map((n) => parseInt(n, 10)));
  if (a[0] !== b[0]) return 'major';
  return a[1] !== b[1] ? 'minor' : 'patch';
};
const kindHe = { patch: 'תיקוני באגים', minor: 'יכולות חדשות (תואם לאחור)', major: 'גרסה ראשית: שינויים שעלולים לשבור' };

// Known reasons a package is held back on purpose.
const notes = {
  tailwindcss: 'המובייל נשאר על 3 בכוונה (NativeWind); הדשבורד כבר על 4',
  typescript: 'הגרסה נקבעת לפי Expo SDK',
  '@types/node': 'עוקב אחרי גרסת Node של Vercel',
};

const must = [];
const recommended = [];
const later = [];

// 1. Expo SDK alignment
const expoCheck = run('npx', ['expo', 'install', '--check'], `${root}/apps/mobile`);
for (const line of `${expoCheck.stdout}\n${expoCheck.stderr}`.split('\n')) {
  const m = line.match(/^\s*(\S+)@(\S+) - expected version: (\S+)/);
  if (m) {
    must.push(
      `- **${m[1]}** ${m[2]} ← ${m[3]} · Expo דורש את הגרסה הזו ל-SDK הנוכחי; גרסה לא תואמת עלולה לגרום לבאגים או לקריסה בבילד. [מה השתנה](${changesLink(m[1])})`,
    );
  }
}
const expoHow = must.length
  ? '\nאיך: `cd apps/mobile && npx expo install --fix`, ואז `npm install` בתיקייה הראשית.'
  : '';

// 2. Security
const allAudit = json(run('npm', ['audit', '--json']).stdout, {}).vulnerabilities ?? {};
const prodAudit = json(run('npm', ['audit', '--json', '--omit=dev']).stdout, {}).vulnerabilities ?? {};
for (const [name, v] of Object.entries(allAudit)) {
  const titles = [...new Set((v.via ?? []).map((x) => (typeof x === 'string' ? `דרך ${x}` : x.title)))].slice(0, 2).join('; ');
  const fix =
    v.fixAvailable === true
      ? 'יש תיקון: `npm audit fix`'
      : v.fixAvailable && typeof v.fixAvailable === 'object'
        ? `התיקון דורש ${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (גרסה ראשית)' : ''}`
        : 'עוד אין תיקון';
  const line = `- **${name}** · אבטחה, ${v.severity} · ${titles} · ${fix}`;
  // npm sometimes "fixes" by moving Expo to an older SDK: never do that, wait for Expo's fix.
  const downgrade = v.fixAvailable?.name === 'expo' && parseInt(v.fixAvailable.version, 10) < 58;
  if (downgrade) {
    later.push(
      `- **${name}** · אבטחה, ${v.severity} · ${titles} · בכלי הבנייה של Expo, לא בקוד שרץ בטלפון. npm מציע להוריד ל-Expo ישן: לא לעשות; יתוקן בעדכון של Expo.`,
    );
    continue;
  }
  if (!prodAudit[name]) later.push(`${line} · רק בכלי פיתוח, לא באפליקציה`);
  else if (v.severity === 'high' || v.severity === 'critical') must.push(line);
  else recommended.push(line);
}

// 3. Outdated packages
const outdated = json(run('npm', ['outdated', '--workspaces', '--json']).stdout, {});
for (const [name, entries] of Object.entries(outdated)) {
  const list = Array.isArray(entries) ? entries : [entries];
  const where = [...new Set(list.map((e) => e.dependent))].join(', ');
  const e = list[0];
  if (!e.current) continue;
  const dev = list.every((x) => isDev(name, x.dependent));
  if (expoManaged(name)) {
    if (kind(e.current, e.latest) === 'major') {
      later.push(`- **${name}** ${e.current} ← ${e.latest} (${where}) · מתעדכן רק יחד עם שדרוג SDK של Expo.`);
    }
    continue;
  }
  if (e.wanted !== e.current) {
    const k = kind(e.current, e.wanted);
    const line = `- **${name}** ${e.current} ← ${e.wanted} (${where}) · ${kindHe[k]}${dev ? ' · כלי פיתוח' : ''}. [מה השתנה](${changesLink(name)})`;
    (dev ? later : recommended).push(line);
  }
  if (e.latest !== e.wanted && kind(e.wanted, e.latest) === 'major') {
    later.push(
      `- **${name}** ${e.wanted} ← ${e.latest} (${where}) · ${notes[name] ?? `${kindHe.major}; צריך תכנון ובדיקה`}. [מה השתנה](${changesLink(name)})`,
    );
  }
}

const date = new Date().toISOString().slice(0, 10);
const section = (title, why, items) =>
  `## ${title} (${items.length})\n${why}\n\n${items.length ? items.join('\n') : '_אין._'}\n`;
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const report = `# דוח חבילות · ${date}

שום דבר לא מתעדכן לבד. הדוח מראה מה יש, למה, ומה ההמלצה; העדכון עצמו נעשה רק אחרי אישור, ב-\`dev\`, ועובר CI.
נבדק על ${commit}.

${section('חובה', 'אבטחה ברמה גבוהה בחבילות שהאפליקציה מריצה, או חבילות ש-Expo דורש בגרסה אחרת.', must)}${expoHow}
${section('מומלץ', 'תיקוני באגים ושיפורים שתואמים לאחור, ואבטחה ברמה בינונית/נמוכה בחבילות שהאפליקציה מריצה.', recommended)}
${section('לא דחוף', 'גרסאות ראשיות (צריך תכנון), כלי פיתוח, ואבטחה שנוגעת רק לכלי פיתוח (לא נשלחת למשתמשים).', later)}
`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (must.length) {
  const text = `${must.length} dependency item(s) marked "must" (חובה). See the job summary.`;
  if (process.argv.includes('--fail-on-must')) {
    console.error(`::error::${text}`);
    process.exit(1);
  }
  console.log(`::warning::${text}`);
}
