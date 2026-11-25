-- First-party analytics for lut.openanthropic.com (D1: lut-studio-db).
--
-- Privacy boundary is enforced at write time in src/worker.js: no IP address is
-- ever stored, the user agent is reduced to a short family label, the referrer
-- to a bare hostname, and the visitor id is a random string the browser
-- generates (localStorage) that is not derived from anything about the device.
--
-- `day` is the ASIA/SHANGHAI (UTC+8) calendar day, computed by the worker, so a
-- report line matches what the machine's owner calls "yesterday".
--
-- Apply with:
--   npx wrangler d1 execute lut-studio-db --remote --file scripts/analytics-schema.sql

-- One row per pageview (a navigation, or a client-side route if one is ever added).
CREATE TABLE IF NOT EXISTS visits (
  day         TEXT    NOT NULL,     -- YYYY-MM-DD, UTC+8
  ts          INTEGER NOT NULL,     -- unix seconds
  vid         TEXT    NOT NULL,     -- random first-party visitor id
  path        TEXT    NOT NULL,     -- normalized pathname
  ref         TEXT    NOT NULL DEFAULT '',  -- referrer hostname, '' = direct
  country     TEXT    NOT NULL DEFAULT '',
  lang        TEXT    NOT NULL DEFAULT '',  -- zh-CN / en / ...
  device      TEXT    NOT NULL DEFAULT '',  -- desktop | tablet | mobile
  client      TEXT    NOT NULL DEFAULT 'browser',
  new_visitor INTEGER NOT NULL DEFAULT 0,
  vw          INTEGER,              -- viewport width, px
  ua          TEXT    NOT NULL DEFAULT ''   -- short family label, not the raw UA
);
CREATE INDEX IF NOT EXISTS idx_visits_day  ON visits(day);
CREATE INDEX IF NOT EXISTS idx_visits_vid  ON visits(day, vid);
CREATE INDEX IF NOT EXISTS idx_visits_path ON visits(day, path);

-- Named interaction events: the product funnel (photo opened, look applied,
-- export finished, ...). `meta` is a small JSON object, truncated at write time.
CREATE TABLE IF NOT EXISTS events (
  day      TEXT    NOT NULL,
  ts       INTEGER NOT NULL,
  vid      TEXT    NOT NULL,
  name     TEXT    NOT NULL,
  path     TEXT    NOT NULL DEFAULT '',
  meta     TEXT    NOT NULL DEFAULT '',
  country  TEXT    NOT NULL DEFAULT '',
  device   TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_day  ON events(day, name);
CREATE INDEX IF NOT EXISTS idx_events_vid  ON events(day, vid);

-- One row per pageview, emitted on pagehide: this is the field data that says
-- whether the site actually feels fast for real visitors on real networks.
CREATE TABLE IF NOT EXISTS vitals (
  day     TEXT    NOT NULL,
  ts      INTEGER NOT NULL,
  vid     TEXT    NOT NULL,
  path    TEXT    NOT NULL,
  device  TEXT    NOT NULL DEFAULT '',
  country TEXT    NOT NULL DEFAULT '',
  lcp     INTEGER,                  -- ms
  inp     INTEGER,                  -- ms
  cls     INTEGER,                  -- CLS * 1000
  ttfb    INTEGER,                  -- ms
  fcp     INTEGER                   -- ms
);
CREATE INDEX IF NOT EXISTS idx_vitals_day ON vitals(day, path);

-- Crawler fetches. This is how we find out whether Googlebot/Bingbot/AI
-- crawlers actually visit us, and which pages they refuse to spend on.
CREATE TABLE IF NOT EXISTS bot_hits (
  day    TEXT    NOT NULL,
  ts     INTEGER NOT NULL,
  bot    TEXT    NOT NULL,          -- googlebot / bingbot / gptbot / other ...
  path   TEXT    NOT NULL,
  status INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bot_day ON bot_hits(day, bot);
