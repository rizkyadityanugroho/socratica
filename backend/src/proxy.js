/**
 * SOCKS5 proxy helper for Gemini API calls.
 * Routes @google/genai SDK requests through Cloudflare WARP
 * to bypass geo-restrictions via SOCKS5 proxy.
 *
 * Also converts x-goog-api-key header to ?key= query param,
 * because Google's API gateway rejects header-based auth
 * from Cloudflare WARP IPs (403) while query-param auth works.
 *
 * Usage: set GEMINI_PROXY=socks5://host.docker.internal:40001
 */

import { SocksProxyAgent } from 'socks-proxy-agent';

const GOOGLE_API_KEY_HEADER = 'x-goog-api-key';
let socksAgent = null;

/**
 * Create a custom fetch function that routes through SOCKS5 proxy.
 */
export function createProxiedFetch(proxyUrl) {
  if (!proxyUrl) return null;

  socksAgent = new SocksProxyAgent(proxyUrl);
  console.log(`[proxy] routed through ${proxyUrl}`);

  return async function proxiedFetch(url, init = {}) {
    // ── Move x-goog-api-key header to ?key= query param ──────────
    // Google rejects header-based auth from Cloudflare WARP IPs (403)
    // but query-param auth works fine through the proxy.
    let urlStr = typeof url === 'string' ? url : url.toString();
    const headers = init.headers || {};
    let apiKey = null;

    if (headers instanceof Headers) {
      if (headers.has(GOOGLE_API_KEY_HEADER)) {
        apiKey = headers.get(GOOGLE_API_KEY_HEADER);
        headers.delete(GOOGLE_API_KEY_HEADER);
      }
    } else if (headers[GOOGLE_API_KEY_HEADER]) {
      apiKey = headers[GOOGLE_API_KEY_HEADER];
      delete headers[GOOGLE_API_KEY_HEADER];
    }

    if (apiKey) {
      const separator = urlStr.includes('?') ? '&' : '?';
      urlStr += `${separator}key=${encodeURIComponent(apiKey)}`;
    }

    // ── Build the proxied request ────────────────────────────────
    const { hostname, port, pathname, search, protocol } = new URL(urlStr);
    const isHttps = protocol === 'https:';
    const mod = isHttps ? await import('https') : await import('http');

    return new Promise((resolve, reject) => {
      const options = {
        hostname,
        port: port || (isHttps ? 443 : 80),
        path: pathname + search,
        method: init.method || 'GET',
        headers: headers instanceof Headers ? headersToPlain(headers) : headers,
        agent: socksAgent,
        rejectUnauthorized: false,
      };

      const req = mod.request(options, (res) => {
        const contentType = (res.headers['content-type'] || '').toString();

        // Streaming (SSE) — pipe as ReadableStream
        if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
          const webStream = new ReadableStream({
            start(controller) {
              res.on('data', chunk => controller.enqueue(chunk));
              res.on('end', () => controller.close());
              res.on('error', err => controller.error(err));
            },
          });
          return resolve(new Response(webStream, {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: toHeaders(res.headers),
          }));
        }

        // Non-streaming — buffer then resolve
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve(new Response(Buffer.concat(chunks), {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: toHeaders(res.headers),
          }));
        });
      });

      req.on('error', reject);
      if (init.body) {
        req.write(typeof init.body === 'string' ? init.body : JSON.stringify(init.body));
      }
      req.end();
    });
  };
}

function headersToPlain(headers) {
  const h = {};
  headers.forEach((v, k) => { h[k] = v; });
  return h;
}

function toHeaders(nodeHeaders) {
  const h = new Headers();
  if (nodeHeaders) {
    for (const [k, v] of Object.entries(nodeHeaders)) {
      if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    }
  }
  return h;
}
