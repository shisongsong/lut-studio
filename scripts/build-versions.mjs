// Content hashes for the assets the app fetches by URL.
//
// `public/js/*.js`, the LUT pack and the marketing photos are served by fixed
// paths, so they cannot be cached as "immutable" without risking a stale app
// after a deploy. This script writes `public/js/versions.json`, and the Worker
// appends `?v=<hash>` to those URLs in every HTML response. A request whose
// `?v=` matches the manifest is safe to cache for a year; one that does not is
// treated as unversioned (short TTL), which is what keeps a half-deployed cache
// from assembling old JS with new HTML.
//
// Run after `build:luts`, `build:gz` and `build:site`; `npm run deploy` does it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const targets = [];

for (const file of readdirSync(join(PUBLIC, 'js'))) {
  if (file.endsWith('.js')) targets.push(join(PUBLIC, 'js', file));
}
targets.push(join(PUBLIC, 'luts.bin.gz'), join(PUBLIC, 'luts.bin'));
for (const dir of ['photos']) {
  for (const file of readdirSync(join(PUBLIC, dir))) {
    if (/\.(webp|jpg|jpeg|png)$/i.test(file)) targets.push(join(PUBLIC, dir, file));
  }
}

const versions = {};
for (const file of targets) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    continue; // an optional asset that has not been built yet
  }
  const urlPath = '/' + relative(PUBLIC, file).split('\\').join('/');
  versions[urlPath] = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

const out = join(PUBLIC, 'js', 'versions.json');
writeFileSync(out, JSON.stringify(versions, null, 0) + '\n');
console.log(`versions.json: ${Object.keys(versions).length} assets`);
