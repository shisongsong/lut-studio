// Publish the individual .cube files for download.
//
// `luts-src/` is the committed source of truth (one 33³ .cube per look, generated
// from scripts/looks.mjs). The /download page offers them as one zip; the
// per-look pages link a single file. Both need the files under `public/download/`,
// which is generated at deploy time and git-ignored (53 MB of text does not
// belong in git; the sources are already there).
//
// Skips files whose size already matches, so a deploy only uploads what changed.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'luts-src');
const OUT = join(ROOT, 'public', 'download', 'cubes');

const files = readdirSync(SRC).filter((file) => file.toLowerCase().endsWith('.cube')).sort();
if (!files.length) {
  console.error('luts-src/ has no .cube files — run npm run export:cubes first');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

let copied = 0;
let reused = 0;
for (const file of files) {
  const from = join(SRC, file);
  const to = join(OUT, file);
  if (existsSync(to) && statSync(to).size === statSync(from).size) {
    reused++;
    continue;
  }
  writeFileSync(to, readFileSync(from));
  copied++;
}
console.log(`download/cubes: ${files.length} cubes (${copied} copied, ${reused} unchanged)`);
