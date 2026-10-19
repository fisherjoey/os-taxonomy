#!/usr/bin/env node
/**
 * build.mjs — turn the cached LearnAlberta downloads into curriculum records.
 *
 * Writes:
 *   data/curriculum-standards.json   one codes-only curriculum per Alberta definition (slug `ab-<code>`)
 *   .cache/alberta/outcomes.json     local full-text index of every outcome (gitignored, used for alignment)
 *
 *   node scripts/alberta/fetch.mjs && node scripts/alberta/build.mjs && node scripts/update-manifest.mjs
 *
 * Standard codes are positional, so they stay readable and stable for a given
 * LearnAlberta version:
 *   GFC  <course>-OI<i>-GQ<j>-LO<n>     e.g. MATK-OI1-GQ1-LO1 (source code when readable, else position)
 *   POS  <course>-T<i>[-GO<j>[-SO<k>]]  e.g. MAT1791-T1-GO1-SO1 — deepest level present
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = resolve(ROOT, '.cache', 'alberta');
const STANDARDS = resolve(ROOT, 'data', 'curriculum-standards.json');
const PREFIX = 'ab-';
const LICENSE =
  'Codes/identifiers only — verbatim standard text omitted; this source carries an upstream license that does not permit our redistribution of the full text. See PROVENANCE.md.';

if (!existsSync(resolve(CACHE, 'definitions.json'))) {
  console.error('No cache — run node scripts/alberta/fetch.mjs first.');
  process.exit(1);
}
const readCache = (...p) => JSON.parse(readFileSync(resolve(CACHE, ...p), 'utf8'));

const en = (o) => (o && (o['en-ca'] || o['fr-ca'])) || '';
const text = (html) =>
  String(html ?? '')
    .replace(/<li[^>]*>/gi, '; ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/^[;\s]+/, '')
    .trim();
const bySort = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

// --- GFC: OI (organizing idea) → GQ (guiding question) → LO (learning outcome) → KUSP → K/U/SP
function gfcOutcomes(body) {
  const out = [];
  for (const course of body.courses) {
    const grade = course.intendedGradeLevel;
    [...course.curriculums].sort(bySort).forEach((oi, oiIdx) => {
      // Older curricula carry readable codes (MATK-OI1-GQ1); newer ones use opaque ids, so fall back to position.
      const oiNum = /-OI(\d+)$/.exec(oi.code)?.[1] ?? oiIdx + 1;
      [...(oi.curriculums ?? [])].filter((n) => n.typeCode === 'GQ').sort(bySort).forEach((gq, gqIdx) => {
        const gqCode = /^[A-Z0-9_]+-OI\d+-GQ\d+$/.test(gq.code) ? gq.code : `${course.code}-OI${oiNum}-GQ${gqIdx + 1}`;
        const los = [...(gq.curriculums ?? [])].filter((n) => n.typeCode === 'LO').sort(bySort);
        los.forEach((lo, i) => {
          const parts = { K: [], U: [], SP: [] };
          for (const kusp of lo.curriculums ?? []) for (const leaf of kusp.curriculums ?? []) parts[leaf.typeCode]?.push(text(en(leaf.contents)));
          out.push({
            code: `${gqCode}-LO${i + 1}`,
            grades: [grade],
            course: course.code,
            context: [text(en(oi.contents)), text(en(gq.contents))],
            text: text(en(lo.contents)),
            knowledge: parts.K.join(' | '),
            understanding: parts.U.join(' | '),
            skills: parts.SP.join(' | '),
          });
        });
      });
    });
  }
  return out;
}

// --- POS: course → topic → general outcome → specific outcome
function posOutcomes(def, body) {
  const grades = Object.fromEntries((def.courses ?? []).map((c) => [c.courseCode, c.intendedGradeLevel]));
  const out = [];
  for (const course of body.courses) {
    const base = { grades: grades[course.courseCode] ? [grades[course.courseCode]] : [], course: course.courseCode };
    (course.topics ?? []).forEach((topic, ti) => {
      const tCode = `${course.courseCode}-T${ti + 1}`;
      const tTitle = text(en(topic.title));
      const gos = topic.generalOutcomes ?? [];
      if (!gos.length) {
        const t = text(en(topic.content));
        if (t) out.push({ ...base, code: tCode, context: [tTitle], text: t });
        return;
      }
      gos.forEach((go, gi) => {
        const gCode = `${tCode}-GO${gi + 1}`;
        const gText = text(en(go.content)) || text(en(go.title));
        const sos = go.specificOutcomes ?? [];
        if (!sos.length) {
          if (gText) out.push({ ...base, code: gCode, context: [tTitle], text: gText });
          return;
        }
        sos.forEach((so, si) => {
          out.push({ ...base, code: `${gCode}-SO${si + 1}`, context: [tTitle, gText], text: text(en(so.content)) || text(en(so.title)) });
        });
      });
    });
  }
  return out;
}

const definitions = readCache('definitions.json').filter(
  (d) => d.isContentPublished && (d.framework === 'GFC' || d.framework === 'POS'),
);
definitions.sort((a, b) => a.code.localeCompare(b.code));

const curricula = [];
const index = [];
for (const def of definitions) {
  const body = readCache(def.framework.toLowerCase(), `${def.code}.json`);
  const outcomes = def.framework === 'GFC' ? gfcOutcomes(body) : posOutcomes(def, body);
  if (!outcomes.length) continue;
  const slug = PREFIX + def.code.toLowerCase().replace(/_/g, '-');
  const seen = new Set();
  for (const o of outcomes) {
    if (seen.has(o.code)) throw new Error(`duplicate code ${slug}:${o.code}`);
    seen.add(o.code);
    index.push({ key: `${slug}:${o.code}`, slug, subject: en(def.fullName) || en(def.name), framework: def.framework, status: def.curriculumStatus, ...o });
  }
  const status = def.curriculumStatus === 'IMPLEMENTED' ? '' : ` [${def.curriculumStatus.toLowerCase()}]`;
  curricula.push({
    slug,
    country: 'CA',
    name: `Alberta ${def.framework === 'GFC' ? 'Curriculum' : 'Program of Studies'}: ${en(def.fullName) || en(def.name)}${status}`,
    version: `${def.curriculumStatus.toLowerCase()} · published ${def.publishedDate.slice(0, 10)} · modified ${def.lastModifiedDate.slice(0, 10)}`,
    sourceUrl: `https://curriculum.learnalberta.ca/curriculum/en/${def.framework.toLowerCase()}/${def.code}`,
    textIncluded: false,
    license: LICENSE,
    topicCount: outcomes.length,
    topics: outcomes.map((o) => ({ key: `${slug}:${o.code}`, code: o.code })),
  });
}

// Replace any previous Alberta records; leave every other source untouched.
const standards = JSON.parse(readFileSync(STANDARDS, 'utf8'));
standards.curricula = [...standards.curricula.filter((c) => !c.slug.startsWith(PREFIX)), ...curricula];
standards.curriculumCount = standards.curricula.length;
standards.codesOnlySources = [
  ...(standards.codesOnlySources ?? []).filter((s) => !s.startsWith(PREFIX)),
  ...curricula.map((c) => c.slug),
].sort();
writeFileSync(STANDARDS, JSON.stringify(standards, null, 2) + '\n');
writeFileSync(resolve(CACHE, 'outcomes.json'), JSON.stringify(index, null, 1));

console.log(`${curricula.length} Alberta curricula, ${index.length} outcomes → data/curriculum-standards.json (codes only)`);
console.log(`full text index → .cache/alberta/outcomes.json`);
