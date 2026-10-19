#!/usr/bin/env node
/**
 * update-manifest.mjs — refresh data/manifest.json counts and checksums after
 * the standards or alignment files change. Leaves the teaching-research
 * provenance block alone (it is pinned to topics.json, which we do not edit).
 *
 *   node scripts/update-manifest.mjs
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const path = (name) => resolve(DATA, name);
const load = (name) => JSON.parse(readFileSync(path(name), 'utf8'));

const manifest = load('manifest.json');
const standards = load('curriculum-standards.json');

manifest.codesOnlySources = standards.codesOnlySources;
manifest.counts.curricula = standards.curricula.length;
manifest.counts.curriculumStandards = standards.curricula.reduce((n, c) => n + c.topics.length, 0);

if (existsSync(path('alberta-alignments.json'))) {
  const ab = load('alberta-alignments.json');
  manifest.counts.albertaAlignments = ab.alignments.length;
  manifest.counts.topicsWithAlbertaAlignment = new Set(ab.alignments.map((a) => a.topicId)).size;
  manifest.files['alberta-alignments.json'] ??= {};
}

for (const [name, meta] of Object.entries(manifest.files)) {
  const bytes = readFileSync(path(name));
  meta.bytes = bytes.length;
  meta.sha256 = createHash('sha256').update(bytes).digest('hex');
}

writeFileSync(path('manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest updated — ${manifest.counts.curricula} curricula, ${manifest.counts.curriculumStandards} standards`);
