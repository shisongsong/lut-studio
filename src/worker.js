/**
 * LUT ARCHIVE — Cloudflare Worker.
 *
 * Static assets are served from env.ASSETS. The worker adds three things on top:
 *
 *  1. clean URLs. The crawlable pages are generated as `foo.html` files but are
 *     canonical without the extension (`/guides/raw-in-browser`), so `.html` is
 *     redirected to the clean path and a missing extensionless asset is retried
 *     with `.html` / `/index.html`. Without this every page would have two URLs
 *     and Google would pick one for us.
 *  2. a real 404 page instead of the assets binding's bare "Not Found".
 *  3. /api/geo, the only dynamic route: Cloudflare's two-letter country code so
 *     the client can pick its initial language.
 *
 * `run_worker_first` is on in wrangler.jsonc so these redirects are ours and
 * not the assets layer's temporary 307s: a permanent redirect is what tells a
 * crawler the two URLs are one page.
 *
 * Note: do NOT set `content-encoding` on responses here. Cloudflare compresses
 * Worker responses on its own, so an origin-compressed body ends up compressed
 * twice and the browser only undoes one layer. The LUT pack is instead shipped
 * as a plain `luts.bin.gz` asset that the page inflates itself.
 */
import { notFoundHtml } from './not-found.js';

// Built per request: workerd rejects constructing responses at module scope.
const notFound = () =>
  new Response(notFoundHtml, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const REDIRECT = (location, status = 301) =>
  new Response(null, { status, headers: { location, 'cache-control': 'public, max-age=3600' } });

function withHeaders(response, headers) {
  const next = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) next.headers.set(name, value);
  return next;
}

async function asset(env, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/geo') {
      const country = (request.cf && request.cf.country) || 'US';
      return new Response(JSON.stringify({ country }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    // One canonical form per page: /index.html and /foo.html both redirect to
    // the clean URL a crawler should index.
    if (path === '/index.html') return REDIRECT(`/${url.search}`);
    if (path.endsWith('.html')) {
      const clean = path.slice(0, -5) || '/';
      return REDIRECT(`${clean}${url.search}`);
    }

    let response = path === '/' ? await asset(env, request, '/index.html') : await env.ASSETS.fetch(request);

    // html_handling is "none": the mapping from a clean URL to the file on disk
    // is explicit here, both for a trailing-slash directory index and for a bare
    // page path.
    if (response.status === 404 && path.endsWith('/')) {
      response = await asset(env, request, `${path}index.html`);
    }
    if (response.status === 404 && !path.includes('.') && !path.endsWith('/')) {
      const html = await asset(env, request, `${path}.html`);
      if (html.status === 200) response = html;
    }
    if (response.status === 404 && !path.endsWith('/')) {
      const index = await asset(env, request, `${path}/index.html`);
      if (index.status === 200) return REDIRECT(`${path}/${url.search}`);
    }

    // The assets layer redirects a directory to its trailing-slash form with a
    // temporary 307; make that permanent so the two URLs do not compete.
    if ((response.status === 307 || response.status === 308) && !path.includes('.')) {
      const location = response.headers.get('location');
      if (location) return REDIRECT(location);
    }

    if (response.status === 404 && !path.includes('.')) return notFound();

    // Generated HTML is rebuilt on every deploy; a short edge TTL keeps a deploy
    // from being invisible for hours without forcing a revalidation per request.
    if ((response.headers.get('content-type') || '').includes('text/html')) {
      return withHeaders(response, { 'cache-control': 'public, max-age=300, must-revalidate' });
    }
    return response;
  },
};
