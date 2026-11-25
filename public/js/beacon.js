/**
 * First-party analytics for LUT ARCHIVE — deliberately small and boring.
 *
 * What it sends: the pathname, the referrer's hostname, the page language, a
 * device class, the viewport width, whether this browser has visited before, a
 * random visitor id it generated itself, and Core Web Vitals. What it never
 * sends: anything about the photo, the file name, the LUTs you imported, the
 * pixel values, your IP (the Worker never reads it), or your full user agent.
 *
 * No cookies. Nothing is shared with a third party. The endpoint is our own
 * Worker on this origin (`/api/beacon`), so this also keeps working when the
 * site is self-hosted (it simply 404s there).
 *
 * Opting out: visit with Do Not Track enabled, or run
 *   localStorage.setItem('lut.noTrack', '1')
 * in the console once and reload.
 *
 * Events are opt-in through `window.lutTrack(name, meta)`; keep the event list
 * short — every row here is a question the daily report has to answer.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/beacon';
  var ID_KEY = 'lut.aid';
  var MAX_META_CHARS = 160;

  function disabled() {
    try {
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return true;
      if (localStorage.getItem('lut.noTrack') === '1') return true;
    } catch (e) { /* storage blocked: analytics is optional, keep going */ }
    return false;
  }

  if (disabled()) return;

  function randomId() {
    var s = '';
    try {
      var bytes = new Uint8Array(9);
      crypto.getRandomValues(bytes);
      for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(36);
    } catch (e) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return s.slice(0, 14);
  }

  var newVisitor = 0;
  var vid = '';
  try {
    vid = localStorage.getItem(ID_KEY) || '';
    if (!vid) {
      vid = randomId();
      newVisitor = 1;
      localStorage.setItem(ID_KEY, vid);
    }
  } catch (e) {
    // Private mode / storage partitioned away: a per-page id still gives us a
    // pageview count, it just cannot join events across pages.
    vid = randomId();
    newVisitor = 1;
  }

  function normPath(path) {
    if (!path) return '/';
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return path.slice(0, 120);
  }

  function refHost() {
    var ref = document.referrer || '';
    if (!ref) return '';
    try {
      var host = new URL(ref).hostname.replace(/^www\./, '');
      if (host === location.hostname.replace(/^www\./, '')) return ''; // internal navigation
      return host.slice(0, 60);
    } catch (e) {
      return '';
    }
  }

  function device() {
    var w = window.innerWidth || 0;
    if (w && w <= 640) return 'mobile';
    if (w && w <= 1024) return 'tablet';
    return 'desktop';
  }

  function lang() {
    var l = document.documentElement.getAttribute('lang') || navigator.language || '';
    return String(l).slice(0, 12);
  }

  function send(payload) {
    try {
      var body = JSON.stringify(payload);
      if (typeof navigator.sendBeacon === 'function') {
        // text/plain keeps this a "simple" request: no CORS preflight.
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
      fetch(ENDPOINT, {
        method: 'POST',
        body: body,
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        credentials: 'omit',
      }).catch(function () {});
    } catch (e) { /* never let analytics break the editor */ }
  }

  var base = {
    vid: vid,
    p: normPath(location.pathname),
    r: refHost(),
    l: lang(),
    d: device(),
    w: window.innerWidth || 0,
    n: newVisitor,
  };

  send({ t: 'p', b: base });

  // ---- field performance -------------------------------------------------
  // Sampled on pagehide so the numbers describe what the visitor actually saw,
  // not a synthetic run. Values stay null when the browser did not report them.
  var vitals = { lcp: null, cls: null, inp: null };
  var clsValue = 0;
  var inpValue = 0;

  try {
    if ('PerformanceObserver' in window) {
      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        var last = entries[entries.length - 1];
        if (last) vitals.lcp = Math.round(last.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].hadRecentInput) clsValue += entries[i].value;
        }
        vitals.cls = Math.round(clsValue * 1000);
      }).observe({ type: 'layout-shift', buffered: true });

      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].duration > inpValue) inpValue = entries[i].duration;
        }
        vitals.inp = Math.round(inpValue);
      }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
    }
  } catch (e) { /* older browser: pageview only */ }

  var nav = null;
  try {
    var navEntry = performance.getEntriesByType('navigation')[0];
    var paint = performance.getEntriesByType('paint') || [];
    var fcp = null;
    for (var i = 0; i < paint.length; i++) {
      if (paint[i].name === 'first-contentful-paint') fcp = Math.round(paint[i].startTime);
    }
    nav = {
      ttfb: navEntry ? Math.round(navEntry.responseStart) : null,
      fcp: fcp,
      transfer: navEntry && navEntry.transferSize ? navEntry.transferSize : null,
    };
  } catch (e) {}

  var sentVitals = false;
  function flushVitals() {
    if (sentVitals) return;
    sentVitals = true;
    send({
      t: 'v',
      b: base,
      v: {
        lcp: vitals.lcp,
        cls: vitals.cls,
        inp: vitals.inp,
        ttfb: nav ? nav.ttfb : null,
        fcp: nav ? nav.fcp : null,
        bytes: nav ? nav.transfer : null,
      },
    });
  }
  window.addEventListener('pagehide', flushVitals, { capture: true });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushVitals();
  });

  // ---- error signal ------------------------------------------------------
  // A broken build shows up here before it shows up in the complaint inbox.
  // Three per session is enough to name the bug without drowning the table.
  var errorCount = 0;
  function reportError(message) {
    if (errorCount >= 3) return;
    errorCount += 1;
    try { if (window.lutTrack) window.lutTrack('js-error', { m: String(message || '').slice(0, 100) }); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    if (e && e.message) return reportError(e.message);
    var target = e && e.target;
    if (target && target.tagName) {
      reportError('resource:' + target.tagName.toLowerCase() + ':' + String(target.src || target.href || '').slice(-48));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    reportError(reason && (reason.message || reason));
  });

  // ---- product events ----------------------------------------------------
  /** @param {string} name @param {object} [meta] */
  window.lutTrack = function (name, meta) {
    try {
      if (typeof name !== 'string' || !name) return;
      var payload = { t: 'e', b: base, n: name.slice(0, 40) };
      if (meta && typeof meta === 'object') {
        var text = '';
        try { text = JSON.stringify(meta); } catch (e) { text = ''; }
        if (text.length > MAX_META_CHARS) text = text.slice(0, MAX_META_CHARS);
        payload.m = text;
      }
      send(payload);
    } catch (e) { /* ignore */ }
  };
})();
