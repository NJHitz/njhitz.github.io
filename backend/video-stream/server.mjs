import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_SIZE = 25 * 1024 * 1024;
const DEFAULT_PROFILE = 'https://script.google.com/macros/s/AKfycbz3eGOVLqW8lEYYfpn4jvDnoARyQr6C_9MdNmtawZN5trsi1zefQa_9fVAs0u6JoAmE/exec';

// Single byte ranges only. Multiple ranges require multipart responses.
export function parseRange(value, size) {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2])) throw new Error('range');
  let start, end;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('range');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(m[1]); end = m[2] ? Number(m[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw new Error('range');
    end = Math.min(end, size - 1);
  }
  return { start, end, length:end - start + 1 };
}

export function createServer({fetchImpl = fetch, apiKey = process.env.DRIVE_API_KEY,
  profileEndpoint = process.env.PROFILE_ENDPOINT || DEFAULT_PROFILE,
  origins = ['https://njhitz.org', 'https://www.njhitz.org'], maxActive = 16} = {}) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(profileEndpoint)) throw new Error('Invalid profile endpoint');
  let active = 0;
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Vary','Origin');
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) { res.writeHead(403); res.end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Range');
      res.writeHead(204); res.end(); return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(apiKey ? 200 : 503, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:!!apiKey})); return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD, OPTIONS'}); res.end(); return; }
    const match = /^\/v1\/video\/([a-z0-9][a-z0-9-]{0,119})\/([a-zA-Z0-9_-]{10,200})$/.exec(url.pathname);
    if (!match || url.search) { res.writeHead(404); res.end(); return; }
    if (!apiKey) { res.writeHead(503); res.end(); return; }
    if (active >= maxActive) { res.writeHead(503,{'Retry-After':'5'}); res.end(); return; }
    active++;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 90000);
    const disconnected = () => { if (!res.writableEnded) abort.abort(); };
    res.on('close',disconnected);
    let upstream;
    try {
      const [,slug,fileId] = match;
      const profileURL = new URL(profileEndpoint);
      profileURL.searchParams.set('slug',slug);
      // Approval is checked afresh for every byte-range request. No draft reads,
      // client-provided upstream URLs, file list, or cached publication grants.
      const profileResponse = await fetchImpl(profileURL,{signal:abort.signal});
      if (!profileResponse.ok) throw new Error('profile');
      const profile = await profileResponse.json();
      if (!profile.ok || !Array.isArray(profile.player?.videos) ||
          !profile.player.videos.some(v => v.status === 'approved' && v.driveFileId === fileId)) {
        res.writeHead(404); res.end(); return;
      }
      // A server-only, Drive-API-restricted key reads public approved files.
      // No account tokens, credentials, private-folder grants or keys go to clients.
      const driveURL = new URL('https://www.googleapis.com/drive/v3/files/' + fileId);
      driveURL.searchParams.set('fields','id,mimeType,size,capabilities(canDownload)');
      const headers = {'X-Goog-Api-Key':apiKey,'Accept-Encoding':'identity'};
      const metadataResponse = await fetchImpl(driveURL,{headers,signal:abort.signal});
      if (!metadataResponse.ok) throw new Error('metadata');
      const meta = await metadataResponse.json();
      const size = Number(meta.size);
      if (meta.id !== fileId || !TYPES.has(meta.mimeType) || !Number.isSafeInteger(size) || size < 1 || size > MAX_SIZE || meta.capabilities?.canDownload === false) {
        res.writeHead(415); res.end(); return;
      }
      let range;
      try { range = parseRange(req.headers.range,size); }
      catch { res.writeHead(416,{'Content-Range':'bytes */'+size,'Accept-Ranges':'bytes'}); res.end(); return; }
      const status = range ? 206 : 200;
      const responseHeaders = {'Content-Type':meta.mimeType,'Accept-Ranges':'bytes',
        'Content-Length':String(range ? range.length : size), 'Content-Disposition':'inline'};
      if (range) responseHeaders['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      if (req.method === 'HEAD') { res.writeHead(status,responseHeaders); res.end(); return; }
      driveURL.search = '?alt=media';
      if (range) headers.Range = `bytes=${range.start}-${range.end}`;
      upstream = await fetchImpl(driveURL,{headers,signal:abort.signal});
      const expectedRange = range ? responseHeaders['Content-Range'] : null;
      if (upstream.status !== status || (range && upstream.headers.get('content-range') !== expectedRange) ||
          Number(upstream.headers.get('content-length')) !== Number(responseHeaders['Content-Length']) || !upstream.body) throw new Error('media');
      // Stream with backpressure; do not buffer a 25 MB clip for each viewer.
      res.writeHead(status,responseHeaders);
      await pipeline(Readable.fromWeb(upstream.body),res,{signal:abort.signal});
    } catch {
      if (upstream?.body && !upstream.body.locked) await upstream.body.cancel().catch(()=>{});
      if (!res.headersSent) { res.writeHead(502); res.end(); }
      else res.destroy();
    } finally {
      clearTimeout(timeout); res.off('close',disconnected); active--;
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(Number(process.env.PORT || 8080),'0.0.0.0');
}
