#!/usr/bin/env node
/**
 * Export the look recipes to standard .cube files.
 *
 * Writes one 33³ `.cube` per look into `luts-src/`, named `<id>.cube`, in the
 * same order as `public/js/looks.js`. These files are committed to the repo so
 * people can download them and use the looks in Resolve, Premiere, Photoshop,
 * Lightroom, etc. `npm run build:luts` then bakes them into `public/luts.bin`.
 *
 * The output is deterministic: values are quantised to 5 decimals, exactly the
 * precision the original hand-made cubes used, so re-running this script is a
 * no-op for existing files.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRADES } from './looks.mjs';
import { LOOKS } from '../public/js/looks.js';

const SIZE = 33;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'luts-src');

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fmt = (v) => clamp01(v).toFixed(5);

const byId = new Map(GRADES.map((g) => [g.id, g]));

mkdirSync(OUT, { recursive: true });
for (const look of LOOKS) {
  const grade = byId.get(look.id);
  if (!grade) throw new Error(`no recipe for ${look.id}`);
  const lines = [
    `TITLE "${look.name}"`,
    `LUT_3D_SIZE ${SIZE}`,
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
  ];
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const [cr, cg, cb] = grade.fn([r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1)]);
        lines.push(`${fmt(cr)} ${fmt(cg)} ${fmt(cb)}`);
      }
    }
  }
  writeFileSync(join(OUT, `${look.id}.cube`), lines.join('\n') + '\n');
  console.log('wrote luts-src/' + look.id + '.cube');
}
console.log(`\n${LOOKS.length} cubes in ${OUT}`);
