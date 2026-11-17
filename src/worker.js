/**
 * LUT ARCHIVE — Cloudflare Worker.
 *
 * Static assets are served from env.ASSETS. The only API route is /api/geo,
 * which returns Cloudflare's two-letter country code so the client can pick the
 * initial interface language. There is no database, no account system and no
 * billing: the editor runs entirely in the browser and photos never leave it.
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
