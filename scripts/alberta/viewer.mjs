#!/usr/bin/env node
/**
 * viewer.mjs — build a local browser for the Alberta alignments.
 *
 * Bundles the full outcome text (from the local cache, never committed) with
 * topics and alignments into .cache/alberta/viewer/, next to a copy of
 * viewer.html. Serve that directory on a private network only.
 *
 *   node scripts/alberta/viewer.mjs && python3 -m http.server -d .cache/alberta/viewer 8796
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = resolve(ROOT, '.cache', 'alberta', 'viewer');
const load = (...p) => JSON.parse(readFileSync(resolve(ROOT, ...p), 'utf8'));

const topics = load('data', 'topics.json').topics;
const alignments = load('data', 'alberta-alignments.json').alignments;
const outcomes = load('.cache', 'alberta', 'outcomes.json');
const curricula = load('data', 'curriculum-standards.json').curricula.filter((c) => c.slug.startsWith('ab-'));

// Ship full text for every curriculum that has at least one link; the rest only as counts.
const linkedSlugs = new Set(alignments.map((a) => a.standard.split(':')[0]));
const data = {
  builtAt: new Date().toISOString(),
  curricula: curricula.map((c) => ({ slug: c.slug, name: c.name, count: c.topicCount, linked: linkedSlugs.has(c.slug) })),
  outcomes: outcomes
    .filter((o) => linkedSlugs.has(o.slug))
    .map((o) => ({ k: o.key, g: o.grades.join(','), c: o.context.filter(Boolean), t: o.text, kn: o.knowledge, u: o.understanding, s: o.skills })),
  topics: topics.map((t) => ({ id: t.id, n: t.name, s: t.subject, d: t.domain, a: [t.ageRangeStart, t.ageRangeEnd], desc: t.description })),
  links: alignments.map((a) => [a.topicId, a.standard, a.fit === 'direct' ? 1 : 0]),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'data.json'), JSON.stringify(data));
copyFileSync(resolve(HERE, 'viewer.html'), resolve(OUT, 'index.html'));
console.log(`viewer → ${OUT} (${data.outcomes.length} outcomes, ${data.links.length} links)`);
