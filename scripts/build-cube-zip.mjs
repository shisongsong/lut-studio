// Build the downloadable LUT pack.
//
// `luts-src/` holds one 33³ `.cube` per look (the source of truth, also what
// build-luts.mjs bakes into public/luts.bin). This script zips all of them plus
// a licence/readme and the machine-readable look list into
// `public/download/lut-archive-64-luts.zip`, which the /download page offers.
//
// The zip is written by hand (deflate + a small central directory) instead of
// shelling out to `zip`, so the output is byte-identical on every machine: the
// DOS timestamps are fixed and the entry order is sorted. A rebuild therefore
// does not change the URL's content hash for nothing.
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'luts-src');
const OUT_DIR = join(ROOT, 'public', 'download');
const OUT = join(OUT_DIR, 'lut-archive-64-luts.zip');

// ---- crc32 -----------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- minimal zip writer ----------------------------------------------------
// Fixed 2026-11-25 00:00 DOS timestamp: the archive content, not the build
// moment, is what identifies it.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 25;

function zipEntries(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, packed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0o644 << 16, 38); // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const part of central) cdSize += part.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...central, end]);
}

// ---- gather ----------------------------------------------------------------
const lookFiles = readdirSync(SRC)
  .filter((file) => file.toLowerCase().endsWith('.cube'))
  .sort();

if (!lookFiles.length) {
  console.error('luts-src/ has no .cube files — run npm run export:cubes first');
  process.exit(1);
}

const looks = JSON.parse(readFileSync(join(ROOT, 'public', 'looks.json'), 'utf8'));
const readme = `LUT ARCHIVE — ${lookFiles.length} LUT looks
${'-'.repeat(46)}

Every .cube in this archive is an ORIGINAL recipe written for this project
(MIT licensed, https://github.com/shisongsong/lut-studio). They approximate the
named films, camera profiles and cinema grades; they contain no film scan and
no vendor-published LUT data. Vendor LUTs (Panasonic, Fujifilm, Canon, Nikon,
Sony) are not redistributable and are not included — download those from the
camera maker and import them in the editor instead.

Format: standard 3D LUT, LUT_3D_SIZE 33, DOMAIN_MIN 0 0 0, DOMAIN_MAX 1 1 1,
sRGB/Rec.709 input. Works in Resolve, Premiere Pro, Photoshop, Final Cut Pro
and any other .cube capable app. Lightroom Classic cannot read .cube files.

Where to put them:
   DaVinci Resolve      Color page -> LUTs palette -> add the folder, or
                        Project Settings > Color Management > Lookup Tables
   Premiere Pro         Lumetri Color > Creative > Look > Browse
   Photoshop            Layer > New Adjustment Layer > Color Lookup > Load 3D LUT
   Final Cut Pro        Effects > Color > Custom LUT > Choose LUT

The editor: https://lut.openanthropic.com
Look catalogue: https://lut.openanthropic.com/looks
What a LUT is:  https://lut.openanthropic.com/guides/what-is-lut
`;

const entries = [
  { name: 'README.txt', data: Buffer.from(readme, 'utf8') },
  { name: 'looks.json', data: Buffer.from(JSON.stringify(looks, null, 2) + '\n', 'utf8') },
  ...lookFiles.map((file) => ({ name: `cubes/${file}`, data: readFileSync(join(SRC, file)) })),
];

mkdirSync(OUT_DIR, { recursive: true });
const zip = zipEntries(entries);
writeFileSync(OUT, zip);

const rawBytes = entries.reduce((sum, entry) => sum + entry.data.length, 0);
console.log(
  `download/lut-archive-${lookFiles.length}-luts.zip: ${lookFiles.length} cubes, ` +
    `${(rawBytes / 1024 / 1024).toFixed(1)} MB → ${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB`
);
