/**
 * LUT ARCHIVE — Cloudflare Worker.
 *
 * Static assets are served from env.ASSETS. The only API route is /api/geo,
 * which returns Cloudflare's two-letter country code so the client can pick the
 * initial interface language. There is no database, no account system and no
 * billing: the editor runs entirely in the browser and photos never leave it.
 *
 * Note: do NOT set `content-encoding` on responses here. Cloudflare compresses
 * Worker responses on its own, so an origin-compressed body ends up compressed
 * twice and the browser only undoes one layer. The LUT pack is instead shipped
 * as a plain `luts.bin.gz` asset that the page inflates itself.
 */
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
    return env.ASSETS.fetch(request);
  },
};
