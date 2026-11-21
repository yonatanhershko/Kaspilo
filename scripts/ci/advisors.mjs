/**
 * Reads the Supabase security and performance advisors of a project through the
 * Management API and fails on any ERROR-level finding. WARN / INFO findings are listed
 * in the job summary (the known, accepted ones are explained in docs/ci-cd.md).
 *
 * Env: SUPABASE_ACCESS_TOKEN (GitHub secret), PROJECT_REF (GitHub variable).
 * Without them (e.g. a pull request from a fork) it skips.
 */
import { appendFileSync } from 'node:fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.PROJECT_REF;
const summary = (text) => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};
if (!token || !ref) {
  summary('### Supabase advisors\n\nSkipped: SUPABASE_ACCESS_TOKEN or DEV_PROJECT_REF is not set.');
  process.exit(0);
}

let errors = 0;
const lines = ['| type | level | finding | count |', '| --- | --- | --- | --- |'];
for (const type of ['security', 'performance']) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`advisors/${type}: HTTP ${res.status}`);
  const { lints = [] } = await res.json();
  const byName = new Map();
  for (const lint of lints) {
    const key = `${lint.level}|${lint.title ?? lint.name}`;
    byName.set(key, (byName.get(key) ?? 0) + 1);
    if (lint.level === 'ERROR') {
      errors++;
      console.error(`ERROR ${type}: ${lint.detail ?? lint.title}`);
    }
  }
  for (const [key, count] of byName) {
    const [level, title] = key.split('|');
    lines.push(`| ${type} | ${level} | ${title} | ${count} |`);
  }
}
summary(`### Supabase advisors\n\n${lines.join('\n')}\n`);
if (errors) {
  console.error(`${errors} ERROR-level advisor finding(s). Fix them or explain them in docs/ci-cd.md.`);
  process.exit(1);
}
