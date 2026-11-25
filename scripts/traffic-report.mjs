// Daily traffic report for lut.openanthropic.com.
//
// Reads the first-party analytics tables straight out of the remote D1 database
// (schema: scripts/analytics-schema.sql, ingestion: src/worker.js) and prints
// one compact page: yesterday vs the days before, which pages earn visits, where
// visitors come from, whether crawlers show up at all, the product funnel, and
// how the site actually performs on visitors' devices.
//
//   node scripts/traffic-report.mjs            # 7-day window
//   node scripts/traffic-report.mjs --days 30
//   node scripts/traffic-report.mjs --json     # machine-readable, for a cron diff
//   node scripts/traffic-report.mjs --prune    # delete rows older than 180 days
//
// Days are ASIA/SHANGHAI (UTC+8) calendar days, computed at write time, so
// "yesterday" here is the same yesterday the owner saw.
//
// Note: this intentionally ignores wrangler's non-zero exit when no rows match;
// an empty table is a valid report, not a failure.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DB = 'lut-studio-db';

const args = process.argv.slice(2);
const argDays = Number(args[args.indexOf('--days') + 1]);
const DAYS = Number.isFinite(argDays) && argDays > 0 ? Math.min(365, argDays) : 7;
const AS_JSON = args.includes('--json');
const PRUNE = args.includes('--prune');

async function query(sql) {
  try {
    const { stdout } = await run(
      'npx',
      ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
      { maxBuffer: 40 * 1024 * 1024 }
    );
    const start = stdout.indexOf('[');
    if (start < 0) return [];
    const parsed = JSON.parse(stdout.slice(start));
    // --json returns [{results: [...]}, ...]; a multi-statement call returns one
    // entry per statement, we only ever send one.
    return parsed[0]?.results || [];
  } catch (error) {
    console.error(`query failed: ${String(error.message).split('\n')[0]}`);
    return [];
  }
}

const num = (value) => Number(value) || 0;
const pad = (value, width) => String(value).padStart(width);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function bar(value, max, width = 22) {
  if (!max || !value) return '';
  return '█'.repeat(Math.max(1, Math.round((value / max) * width)));
}

function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[rank];
}

function fmtMs(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

// Local (UTC+8) calendar date for "today", so the report window lines up with
// the day column the Worker wrote.
function todayUTC8() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// YYYY-MM-DD + n days, no timezone surprises (the string is already a UTC+8 day).
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const today = todayUTC8();
  const since = `date('${today}', '-${DAYS} day')`;
  const yesterday = addDays(today, -1);

  const [daily, byPath, clients, referrers, countries, devices, langs, events, vitalsRows, bots, botPaths, errors] =
    await Promise.all([
      query(`SELECT day, COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv,
                    SUM(new_visitor) AS fresh
             FROM visits WHERE day >= ${since} GROUP BY day ORDER BY day`),
      query(`SELECT path, COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv
             FROM visits WHERE day >= ${since} GROUP BY path ORDER BY pv DESC LIMIT 15`),
      query(`SELECT client, COUNT(*) AS pv FROM visits WHERE day >= ${since} GROUP BY client`),
      query(`SELECT CASE WHEN ref = '' THEN '(direct/none)' ELSE ref END AS host, COUNT(*) AS pv
             FROM visits WHERE day >= ${since} GROUP BY host ORDER BY pv DESC LIMIT 12`),
      query(`SELECT CASE WHEN country = '' THEN '??' ELSE country END AS country, COUNT(*) AS pv
             FROM visits WHERE day >= ${since} GROUP BY country ORDER BY pv DESC LIMIT 10`),
      query(`SELECT CASE WHEN device = '' THEN '??' ELSE device END AS device, COUNT(*) AS pv
             FROM visits WHERE day >= ${since} GROUP BY device ORDER BY pv DESC`),
      query(`SELECT CASE WHEN lang = '' THEN '??' ELSE lang END AS lang, COUNT(*) AS pv
             FROM visits WHERE day >= ${since} GROUP BY lang ORDER BY pv DESC LIMIT 8`),
      query(`SELECT day, name, COUNT(*) AS n, COUNT(DISTINCT vid) AS people
             FROM events WHERE day >= ${since} GROUP BY day, name ORDER BY day`),
      query(`SELECT device, lcp, inp, cls, ttfb, fcp FROM vitals WHERE day >= ${since} LIMIT 20000`),
      query(`SELECT bot, COUNT(*) AS hits FROM bot_hits WHERE day >= ${since} GROUP BY bot ORDER BY hits DESC`),
      query(`SELECT bot, path, COUNT(*) AS hits FROM bot_hits WHERE day >= ${since}
             GROUP BY bot, path ORDER BY hits DESC LIMIT 12`),
      query(`SELECT meta, COUNT(*) AS n FROM events
             WHERE day >= ${since} AND name IN ('js-error') GROUP BY meta ORDER BY n DESC LIMIT 8`),
    ]);

  const dayRows = new Map(daily.map((row) => [row.day, row]));
  const pvOf = (day) => num(dayRows.get(day)?.pv);
  const uvOf = (day) => num(dayRows.get(day)?.uv);

  const yRow = dayRows.get(yesterday) || {};
  const yPv = num(yRow.pv);
  const yUv = num(yRow.uv);

  // Baseline: the same-length window before yesterday.
  const prevWindow = daily.filter((r) => r.day < yesterday);
  const prevPv = prevWindow.reduce((sum, r) => sum + num(r.pv), 0);
  const prevDays = Math.max(1, prevWindow.length);
  const prevAvg = prevPv / prevDays;

  const totalPv = daily.reduce((sum, r) => sum + num(r.pv), 0);
  const totalUv = daily.reduce((sum, r) => sum + num(r.uv), 0);
  const botTotal = bots.reduce((sum, r) => sum + num(r.hits), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    day: today,
    windowDays: DAYS,
    yesterday: { day: yesterday, pv: yPv, uv: yUv, newVisitors: num(yRow.fresh) },
    previousWindowAvgPv: Number(prevAvg.toFixed(1)),
    window: { pv: totalPv, uv: totalUv, botHits: botTotal, days: daily.length },
    daily: daily.map((r) => ({ day: r.day, pv: num(r.pv), uv: num(r.uv), newVisitors: num(r.fresh) })),
    topPaths: byPath.map((r) => ({ path: r.path, pv: num(r.pv), uv: num(r.uv) })),
    referrers: referrers.map((r) => ({ host: r.host, pv: num(r.pv) })),
    countries: countries.map((r) => ({ country: r.country, pv: num(r.pv) })),
    devices: devices.map((r) => ({ device: r.device, pv: num(r.pv) })),
    languages: langs.map((r) => ({ lang: r.lang, pv: num(r.pv) })),
    events: events.map((r) => ({ day: r.day, name: r.name, n: num(r.n), people: num(r.people) })),
    bots: bots.map((r) => ({ bot: r.bot, hits: num(r.hits) })),
    jsErrors: errors.map((r) => ({ meta: r.meta, n: num(r.n) })),
    vitals: summarizeVitals(vitalsRows),
  };

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // ---- human report ------------------------------------------------------
  const line = (label, value) => console.log(`${label.padEnd(22)}${value}`);

  console.log(`\n■ LUT ARCHIVE traffic — ${today} (UTC+8), window ${DAYS}d\n`);

  const spark = daily
    .map((r) => `${r.day.slice(5)} ${pad(num(r.pv), 4)}pv/${pad(num(r.uv), 3)}uv ${bar(num(r.pv), Math.max(...daily.map((x) => num(x.pv))))}`)
    .join('\n');
  console.log(spark || '(no visits recorded yet)');

  console.log('');
  const delta = prevAvg ? Math.round(((yPv - prevAvg) / prevAvg) * 100) : null;
  line('yesterday', `${yesterday}  ${yPv} pv · ${yUv} uv`);
  line('7d avg before', prevAvg ? `${prevAvg.toFixed(1)} pv/day${delta == null ? '' : `  (${delta >= 0 ? '+' : ''}${delta}%)`}` : 'no baseline');
  line(`window total`, `${totalPv} pv · ${totalUv} uv · ${botTotal} crawler hits`);
  line('new visitors', `${num(yRow.fresh)} yesterday (${pct(num(yRow.fresh), yUv)}% of uv)`);

  const clientTotal = clients.reduce((s, r) => s + num(r.pv), 0);
  console.log(`\n● client`);
  for (const row of clients) line(`  ${row.client}`, `${pad(num(row.pv), 6)}  ${bar(num(row.pv), clientTotal, 18)}`);

  console.log(`\n● pages (${DAYS}d)`);
  const maxPath = Math.max(0, ...byPath.map((r) => num(r.pv)));
  for (const row of byPath) line(`  ${row.path}`, `${pad(num(row.pv), 5)} pv · ${pad(num(row.uv), 4)} uv  ${bar(num(row.pv), maxPath, 14)}`);

  console.log(`\n● referrers`);
  if (!referrers.length) console.log('  (none)');
  for (const row of referrers) line(`  ${row.host}`, `${pad(num(row.pv), 5)}`);

  console.log(`\n● countries / devices / languages`);
  line('  countries', countries.map((r) => `${r.country}:${num(r.pv)}`).join('  ') || '(none)');
  line('  devices', devices.map((r) => `${r.device}:${num(r.pv)}`).join('  ') || '(none)');
  line('  languages', langs.map((r) => `${r.lang}:${num(r.pv)}`).join('  ') || '(none)');

  console.log(`\n● funnel (people per event, ${DAYS}d)`);
  const totals = new Map();
  for (const row of events) totals.set(row.name, (totals.get(row.name) || 0) + num(row.people));
  const order = ['ready', 'looks-first', 'looks', 'photo', 'look', 'autotone', 'export', 'cube', 'download_pack', 'deeplink', 'lang', 'js-error'];
  const names = [...order.filter((n) => totals.has(n)), ...[...totals.keys()].filter((n) => !order.includes(n))];
  if (!names.length) console.log('  (no events yet)');
  const readyPeople = totals.get('ready') || 0;
  for (const name of names) {
    const people = totals.get(name);
    const share = name === 'ready' ? 100 : pct(people, readyPeople || totalUv);
    line(`  ${name}`, `${pad(people, 5)} people  ${pad(share, 3)}% of visitors`);
  }

  console.log(`\n● field performance (${DAYS}d, real devices)`);
  const v = report.vitals;
  if (!v.samples) console.log('  (no vitals yet)');
  else {
    line('  samples', `${v.samples}`);
    line('  LCP p50 / p75', `${fmtMs(v.lcp?.p50)} / ${fmtMs(v.lcp?.p75)}   (good <2.5s, poor >4s)`);
    line('  INP p75', `${fmtMs(v.inp?.p75)}   (good <200ms)`);
    line('  CLS p75', `${v.cls?.p75 == null ? '—' : (v.cls.p75 / 1000).toFixed(3)}   (good <0.1)`);
    line('  TTFB p75', fmtMs(v.ttfb?.p75));
    for (const [device, dv] of Object.entries(v.byDevice || {})) {
      line(`  ${device} (n=${dv.samples})`, `LCP p75 ${fmtMs(dv.lcp?.p75)} · INP p75 ${fmtMs(dv.inp?.p75)}`);
    }
  }

  console.log(`\n● crawlers`);
  if (!bots.length) console.log('  (none — search engines have not fetched any page this window)');
  for (const row of bots) line(`  ${row.bot}`, `${pad(num(row.hits), 5)}`);
  for (const row of botPaths) line(`  ↳ ${row.bot} ${row.path}`, `${num(row.hits)}`);

  console.log(`\n● javascript errors`);
  if (!errors.length) console.log('  (none)');
  for (const row of errors) line('  ', `${row.n} × ${row.meta}`);

  console.log('');
}

function summarizeVitals(rows) {
  if (!rows.length) return { samples: 0, lcp: null, inp: null, cls: null, ttfb: null, fcp: null, byDevice: {} };
  const pick = (key) => {
    const values = rows.map((r) => (r[key] == null ? NaN : Number(r[key])));
    return {
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
    };
  };
  const byDevice = {};
  for (const device of new Set(rows.map((r) => r.device || 'unknown'))) {
    const subset = rows.filter((r) => (r.device || 'unknown') === device);
    byDevice[device] = {
      samples: subset.length,
      lcp: { p75: percentile(subset.map((r) => r.lcp), 75) },
      inp: { p75: percentile(subset.map((r) => r.inp), 75) },
      cls: { p75: percentile(subset.map((r) => r.cls), 75) },
    };
  }
  return {
    samples: rows.length,
    lcp: pick('lcp'),
    inp: pick('inp'),
    cls: pick('cls'),
    ttfb: pick('ttfb'),
    fcp: pick('fcp'),
    byDevice,
  };
}

async function prune() {
  const cutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  for (const table of ['visits', 'events', 'vitals', 'bot_hits']) {
    try {
      await run(
        'npx',
        ['wrangler', 'd1', 'execute', DB, '--remote', '--command', `DELETE FROM ${table} WHERE day < '${cutoff}'`],
        { maxBuffer: 8 * 1024 * 1024 }
      );
      console.log(`pruned ${table} < ${cutoff}`);
    } catch (error) {
      console.error(`prune ${table} failed: ${String(error.message).split('\n')[0]}`);
    }
  }
}

if (PRUNE) await prune();
await main();
