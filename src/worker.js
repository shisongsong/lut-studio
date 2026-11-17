/**
 * LUT ARCHIVE — Cloudflare Worker.
 *
 * Static assets are served from env.ASSETS. Two pieces of logic sit in front of
 * that:
 *
 *  - /api/geo returns Cloudflare's two-letter country code so the client can
 *    pick the initial interface language.
 *  - the LUT pack is stored pre-compressed as `luts.bin.br` and served with
 *    `content-encoding: br`. Cloudflare does compress the wasm decoder on its
 *    own but NOT `application/octet-stream`, so the first visit used to
 *    download all 844 KB of LUTs raw. Browsers without brotli get the plain
 *    file exactly as before.
 *
 * There is no database, no account system and no billing: the editor runs
 * entirely in the browser and photos never leave it.
 */
const PRECOMPRESSED = new Map([
  ['/luts.bin', { file: '/luts.bin.br', type: 'application/octet-stream' }],
]);

function acceptsBrotli(request) {
  const enc = request.headers.get('accept-encoding') || '';
  return /(?:^|,)\s*br\s*(?:;|,|$)/i.test(enc);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/geo') {
      const country = (request.cf && request.cf.country) || 'US';
      return new Response(JSON.stringify({ country }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    const pre = PRECOMPRESSED.get(url.pathname);
    if (pre && acceptsBrotli(request) && (request.method === 'GET' || request.method === 'HEAD')) {
      const headers = new Headers();
      // Fetch the .br bytes as-is: asking for identity keeps the asset layer from
      // wrapping our already-compressed file in another encoding.
      headers.set('accept-encoding', 'identity');
      const body = await env.ASSETS.fetch(new Request(new URL(pre.file, url).toString(), { headers }));
      if (body.ok) {
        const out = new Headers({
          'content-type': pre.type,
          'content-encoding': 'br',
          'vary': 'Accept-Encoding',
          'cache-control': 'public, max-age=0, must-revalidate',
        });
        const etag = body.headers.get('etag');
        if (etag) out.set('etag', etag);
        const len = body.headers.get('content-length');
        if (len) out.set('content-length', len);
        return new Response(request.method === 'HEAD' ? null : body.body, { status: 200, headers: out });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
