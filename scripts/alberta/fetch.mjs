#!/usr/bin/env node
/**
 * fetch.mjs — download every published Alberta curriculum from new LearnAlberta
 * into .cache/alberta/ (gitignored). Nothing here is committed: LearnAlberta
 * content is Crown copyright, so the repo ships codes only (see PROVENANCE.md).
 *
 *   node scripts/alberta/fetch.mjs
 *
 * Two formats live on the public CDN:
 *   GFC — the "Guiding Framework" curricula (K–6 and newer 7–12), cdn/curriculum/gfc-<code>.json
 *   POS — older Programs of Study, cdn/pos/json/<CODE>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDN = 'https://curriculum.learnalberta.ca/cdn/';
const CACHE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'alberta');
// CloudFront rejects requests without a browser-like user agent.
const HEADERS = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };

async function getJson(path) {
  const res = await fetch(CDN + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const contentPath = (d) =>
  d.framework === 'GFC' ? `curriculum/gfc-${d.code.toLowerCase()}.json` : `pos/json/${d.code}.json`;

mkdirSync(resolve(CACHE, 'gfc'), { recursive: true });
mkdirSync(resolve(CACHE, 'pos'), { recursive: true });

const definitions = await getJson('cia/curriculum-definition/definitions.json');
writeFileSync(resolve(CACHE, 'definitions.json'), JSON.stringify(definitions));

const published = definitions.filter((d) => d.isContentPublished && (d.framework === 'GFC' || d.framework === 'POS'));
let failed = 0;
// Small batches keep us polite to the CDN.
for (let i = 0; i < published.length; i += 8) {
  await Promise.all(
    published.slice(i, i + 8).map(async (d) => {
      try {
        const body = await getJson(contentPath(d));
        writeFileSync(resolve(CACHE, d.framework.toLowerCase(), `${d.code}.json`), JSON.stringify(body));
      } catch (e) {
        failed++;
        console.error(`✗ ${d.code}: ${e.message}`);
      }
    }),
  );
}

writeFileSync(resolve(CACHE, 'fetched-at.txt'), new Date().toISOString() + '\n');
console.log(`${published.length - failed}/${published.length} curricula cached in ${CACHE}`);
if (failed) process.exit(1);
