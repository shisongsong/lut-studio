#!/usr/bin/env node
/**
 * Optional end-to-end numeric reference test for the RAW display transform.
 *
 * It renders a deterministic 128x512 scene-linear EV ramp through darktable
 * 5.6.2's sigmoid module (enabled by the checked-in XMP sidecar), decodes the
 * 16-bit sRGB PNG in memory, and compares pixel values with renderer.js. It
 * uses no screen captures and does not read or modify the user's darktable DB.
 * Run with: npm run test:tone:reference
 */
import { mkdtempSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { SIGMOID, sigmoidFit } from '../public/js/renderer.js';

const EXPECTED_DARKTABLE = '5.6.2';
const MAX_LINEAR_ERROR = 0.0016;

function findDarktableCli() {
  const names = process.platform === 'win32' ? ['darktable-cli.exe'] : ['darktable-cli'];
  const candidates = [
    process.env.DARKTABLE_CLI,
    '/Applications/darktable.app/Contents/MacOS/darktable-cli',
    ...String(process.env.PATH || '').split(delimiter).flatMap((dir) => names.map((name) => join(dir, name))),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function run(cli, args, options = {}) {
  const result = spawnSync(cli, args, { encoding: 'utf8', timeout: 120_000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cli} exited ${result.status}\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

function decodePng16Rgb(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error('darktable output is not a PNG');

  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('truncated PNG chunk');
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (bitDepth !== 16 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`expected non-interlaced 16-bit RGB PNG, got ${width}x${height}, depth=${bitDepth}, color=${colorType}, interlace=${interlace}`);
  }
  const channels = colorType === 2 ? 3 : 4;
  const bpp = channels * 2;
  const rowBytes = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (rowBytes + 1)) throw new Error('unexpected PNG scanline data size');
  const samples = new Uint16Array(width * height * channels);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let previous = Buffer.alloc(rowBytes);
  let source = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[source++];
    const scanline = raw.subarray(source, source + rowBytes);
    source += rowBytes;
    const row = Buffer.alloc(rowBytes);
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = previous[i];
      const upperLeft = i >= bpp ? previous[i - bpp] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else throw new Error(`unsupported PNG filter ${filter}`);
      row[i] = (scanline[i] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const byte = x * bpp + c * 2;
        samples[(y * width + x) * channels + c] = row[byte] * 256 + row[byte + 1];
      }
    }
    previous = row;
  }
  return { width, height, channels, samples };
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function sigmoidCurve(fit, value) {
  const u = (fit.fog + Math.max(value, 0)) ** fit.p;
  const y = fit.w * (u / (fit.pe + u)) ** fit.q;
  return Number.isNaN(y) ? fit.w : y;
}

function main() {
  const cli = findDarktableCli();
  if (!cli) {
    console.log('SKIP darktable sigmoid reference: darktable-cli is not installed (set DARKTABLE_CLI to enable).');
    return;
  }
  const version = run(cli, ['--version']);
  const versionText = `${version.stdout}\n${version.stderr}`;
  if (!versionText.includes(`darktable ${EXPECTED_DARKTABLE}`)) {
    console.log(`SKIP darktable sigmoid reference: expected darktable ${EXPECTED_DARKTABLE}; got ${versionText.trim().split('\n')[0]}.`);
    return;
  }

  const input = fileURLToPath(new URL('./fixtures/sigmoid-gradient.tif', import.meta.url));
  const xmp = `${input}.xmp`;
  const work = mkdtempSync(join(tmpdir(), 'lut-studio-darktable-sigmoid-'));
  const paths = Object.fromEntries(['home', 'config', 'cache', 'tmp', 'out'].map((name) => [name, join(work, name)]));
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true });

  const { stdout, stderr } = run(cli, [
    input, xmp, paths.out,
    '--apply-custom-presets', 'false',
    '--icc-type', 'SRGB', '--icc-intent', 'RELATIVE_COLORIMETRIC',
    '--hq', 'true', '--upscale', 'false', '--out-ext', 'png', '--verbose',
    '--core', '--configdir', paths.config, '--cachedir', paths.cache, '--tmpdir', paths.tmp,
    '--disable-opencl', '-t', '1',
    '--conf', 'plugins/darkroom/workflow=scene-referred (sigmoid)',
    '--conf', 'plugins/imageio/format/png/bpp=16',
  ], { env: { ...process.env, HOME: paths.home } });
  const logs = `${stdout}\n${stderr}`;
  if (!logs.toLowerCase().includes('sigmoid')) throw new Error('darktable log did not confirm the sigmoid module');

  const output = join(paths.out, 'sigmoid-gradient.png');
  if (!existsSync(output) || statSync(output).size === 0) throw new Error('darktable produced no PNG output');
  const { width, height, channels, samples } = decodePng16Rgb(readFileSync(output));
  if (width !== 128 || height !== 512) throw new Error(`unexpected reference dimensions ${width}x${height}`);

  const fit = sigmoidFit(SIGMOID.contrast, SIGMOID.skew, SIGMOID.white, SIGMOID.black);
  let maxError = 0, meanError = 0, maxErrorEv = 0, maxChannelSpread = 0;
  const x = Math.floor(width / 2);
  for (let y = 0; y < height; y++) {
    const base = (y * width + x) * channels;
    const rgb = [0, 1, 2].map((c) => samples[base + c] / 65535);
    const displayLinear = rgb.reduce((sum, encoded) => sum + srgbToLinear(encoded), 0) / 3;
    const ev = -12 + 20 * y / (height - 1);
    const expected = sigmoidCurve(fit, 0.18 * 2 ** ev);
    const error = Math.abs(displayLinear - expected);
    if (error > maxError) { maxError = error; maxErrorEv = ev; }
    meanError += error;
    maxChannelSpread = Math.max(maxChannelSpread, Math.max(...rgb) - Math.min(...rgb));
  }
  meanError /= height;
  if (maxError > MAX_LINEAR_ERROR) {
    throw new Error(`sigmoid numeric regression: max linear error ${maxError.toFixed(7)} at ${maxErrorEv.toFixed(3)} EV exceeds ${MAX_LINEAR_ERROR}`);
  }
  if (maxChannelSpread > 0.0001) throw new Error(`neutral ramp gained color: max encoded channel spread ${maxChannelSpread}`);

  console.log(`darktable sigmoid reference: PASS (${width}x${height}, 16-bit PNG; max linear error ${maxError.toFixed(7)} at ${maxErrorEv.toFixed(3)} EV; mean ${meanError.toFixed(7)}).`);
  console.log(`Reference output retained for inspection at ${output}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 1;
}
