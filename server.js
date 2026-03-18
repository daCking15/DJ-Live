const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.AUDD_API_TOKEN || 'test';

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Internal error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function handleRecognize(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  if (!API_TOKEN) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'error',
      error: { error_message: 'AUDD_API_TOKEN not set. Add it to .env or run: AUDD_API_TOKEN=your_token node server.js' },
    }));
    return;
  }

  const boundary = req.headers['content-type']?.match(/boundary=([^;\s]+)/)?.[1]?.trim();
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', error: { error_message: 'Invalid content type' } }));
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const url = 'https://api.audd.io/?return=apple_music,spotify&api_token=' + encodeURIComponent(API_TOKEN);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const auddReq = require('https').request(url, options, (auddRes) => {
      let data = '';
      auddRes.on('data', (c) => (data += c));
      auddRes.on('end', () => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
    });

    auddReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        error: { error_message: err.message },
      }));
    });

    auddReq.write(body);
    auddReq.end();
  });
}

/* Parse ytInitialData from YouTube HTML (bracket-matched, handles large nested JSON) */
function parseYtInitialData(html) {
  const start = html.indexOf('var ytInitialData = ');
  if (start === -1) return null;
  let i = start + 'var ytInitialData = '.length;
  if (html[i] !== '{') return null;
  let depth = 1;
  const begin = i;
  for (i++; i < html.length && depth > 0; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') depth--;
  }
  if (depth !== 0) return null;
  try {
    return JSON.parse(html.slice(begin, i));
  } catch (_) { return null; }
}

function extractVideoRenderers(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  const pushVideo = (vr) => {
    if (!vr?.videoId) return;
    out.push({
      id: vr.videoId,
      title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || '',
      'owner.screenname': vr.ownerText?.runs?.[0]?.text || vr.ownerText?.simpleText || ''
    });
  };
  const pushById = (id, title, owner) => {
    if (id) out.push({ id, title: title || '', 'owner.screenname': owner || '' });
  };
  if (obj.videoRenderer?.videoId) { pushVideo(obj.videoRenderer); return; }
  if (obj.gridVideoRenderer?.videoId) { pushVideo(obj.gridVideoRenderer); return; }
  if (obj.playlistVideoRenderer?.videoId) {
    const pv = obj.playlistVideoRenderer;
    pushVideo({ videoId: pv.videoId, title: pv.title, ownerText: pv.shortBylineText });
    return;
  }
  const reel = obj.reelItemRenderer?.navigationEndpoint?.reelWatchEndpoint;
  if (reel?.videoId) {
    pushById(reel.videoId, obj.reelItemRenderer?.headline?.simpleText || obj.reelItemRenderer?.headline?.runs?.[0]?.text, '');
    return;
  }
  if (obj.sectionListRenderer?.contents) {
    for (const sec of obj.sectionListRenderer.contents) {
      for (const it of (sec?.itemSectionRenderer?.contents || [])) {
        extractVideoRenderers(it, out);
      }
    }
    return;
  }
  if (Array.isArray(obj)) { for (const x of obj) extractVideoRenderers(x, out); return; }
  for (const k of Object.keys(obj)) extractVideoRenderers(obj[k], out);
}

function extractChannelVideos(data) {
  const videos = [];
  const pushVideo = (vr) => {
    if (!vr?.videoId) return;
    videos.push({
      id: vr.videoId,
      title: vr.title?.runs?.[0]?.text || vr.title?.simpleText || '',
      'owner.screenname': vr.ownerText?.runs?.[0]?.text || vr.ownerText?.simpleText || ''
    });
  };
  const browse = data?.contents?.twoColumnBrowseResultsRenderer || data?.contents?.singleColumnBrowseResultsRenderer;
  const tabs = browse?.tabs;
  if (Array.isArray(tabs)) {
    for (const tab of tabs) {
      const content = tab?.tabRenderer?.content;
      const items = content?.richGridRenderer?.contents;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const inner = item?.richItemRenderer?.content;
        if (inner?.videoRenderer) pushVideo(inner.videoRenderer);
        else if (inner?.gridVideoRenderer) pushVideo(inner.gridVideoRenderer);
        else if (inner?.reelItemRenderer) {
          const vid = inner.reelItemRenderer?.navigationEndpoint?.reelWatchEndpoint?.videoId;
          if (vid) videos.push({ id: vid, title: inner.reelItemRenderer?.headline?.simpleText || '', 'owner.screenname': '' });
        }
        if (item?.sectionListRenderer?.contents) {
          for (const sec of item.sectionListRenderer.contents) {
            for (const it of (sec?.itemSectionRenderer?.contents || [])) {
              extractVideoRenderers(it, videos);
            }
          }
        }
      }
    }
  }
  if (videos.length === 0) extractVideoRenderers(data, videos);
  return videos.slice(0, 100);
}

function getChannelIdFromPageData(data) {
  const id = data?.metadata?.channelMetadataRenderer?.externalId
    || data?.header?.c4HeaderRenderer?.channelId
    || data?.contents?.twoColumnBrowseResultsRenderer?.header?.c4HeaderRenderer?.channelId;
  return (id && /^UC[\w-]{20,}$/.test(id)) ? id : '';
}

const YT_OPTS = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html', 'Accept-Language': 'en' } };

function fetchYtWithRedirects(url, depth, cb) {
  if (depth > 5) return cb(null, '');
  const lib = url.startsWith('https') ? require('https') : require('http');
  lib.get(url, YT_OPTS, (res) => {
    const code = res.statusCode || 0;
    if (code >= 301 && code <= 308 && res.headers.location) {
      const loc = res.headers.location;
      const next = loc.startsWith('http') ? loc : (new URL(loc, url)).href;
      if (/^https:\/\/(www\.)?youtube\.com\//.test(next))
        return fetchYtWithRedirects(next, depth + 1, cb);
    }
    let body = '';
    res.on('data', c => (body += c));
    res.on('end', () => cb(null, body));
  }).on('error', (err) => cb(err, ''));
}

function handleYouTubeChannel(req, res, handleOrChannelId) {
  const clean = (handleOrChannelId || '').replace(/^@/, '').trim();
  if (!clean) {
    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end('[]');
  }
  const isChannelId = /^UC[a-zA-Z0-9_-]{20,}$/.test(clean);
  const url = isChannelId
    ? 'https://www.youtube.com/channel/' + clean + '/videos'
    : 'https://www.youtube.com/@' + clean + '/videos';
  fetchYtWithRedirects(url, 0, (err, body) => {
    if (err) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end('[]');
    }
    try {
      const data = parseYtInitialData(body);
        let videos = data ? extractChannelVideos(data) : [];
        if (videos.length === 0 && data) {
          let channelId = isChannelId ? clean : getChannelIdFromPageData(data);
          const tryPlaylist = (cid) => {
            if (!cid || !/^UC[\w-]{20,}$/.test(cid)) {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify(videos.slice(0, 100)));
              return;
            }
            const playlistUrl = 'https://www.youtube.com/playlist?list=UU' + cid.slice(2);
            require('https').get(playlistUrl, YT_OPTS, (plRes) => {
              let plBody = '';
              plRes.on('data', c => (plBody += c));
              plRes.on('end', () => {
                try {
                  const plData = parseYtInitialData(plBody);
                  const plVideos = plData ? extractChannelVideos(plData) : [];
                  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify(plVideos.slice(0, 100)));
                } catch (_) {
                  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify(videos.slice(0, 100)));
                }
              });
            }).on('error', () => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify(videos.slice(0, 100)));
            });
          };
          if (!channelId && !isChannelId) {
            require('https').get('https://www.youtube.com/@' + clean, YT_OPTS, (mainRes) => {
              let mainBody = '';
              mainRes.on('data', c => (mainBody += c));
              mainRes.on('end', () => {
                const mainData = parseYtInitialData(mainBody);
                channelId = mainData ? getChannelIdFromPageData(mainData) : '';
                tryPlaylist(channelId);
              });
            }).on('error', () => tryPlaylist(''));
            return;
          }
          tryPlaylist(channelId);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(videos.slice(0, 100)));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end('[]');
    }
  });
}

/* YouTube search — same format as yt-proxy.js for drop-in compatibility */
function handleYouTubeSearch(req, res, query) {
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  require('https').get(url, YT_OPTS, (ytRes) => {
    let body = '';
    ytRes.on('data', c => (body += c));
    ytRes.on('end', () => {
      try {
        const data = parseYtInitialData(body);
        if (!data) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end('[]');
        }
        const sections = data.contents?.twoColumnSearchResultsRenderer
          ?.primaryContents?.sectionListRenderer?.contents ?? [];
        const results = [];
        for (const sec of sections) {
          for (const it of (sec.itemSectionRenderer?.contents || [])) {
            const vr = it.videoRenderer;
            if (!vr?.videoId) continue;
            results.push({
              id: vr.videoId,
              title: vr.title?.runs?.[0]?.text || '',
              channel: vr.ownerText?.runs?.[0]?.text || ''
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(results.slice(0, 20)));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('[]');
      }
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let parsed;
  try {
    parsed = new URL(req.url || '/', 'http://localhost');
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (parsed.pathname === '/api/recognize') {
    console.log('[DJ Live] Query: /api/recognize (AudD proxy)');
    handleRecognize(req, res);
    return;
  }

  if (parsed.pathname === '/api/youtube/channel') {
    const handle = parsed.searchParams.get('handle');
    const channelId = parsed.searchParams.get('channelId');
    const ref = channelId || handle;
    if (!ref) { res.writeHead(400); res.end('Missing handle or channelId param'); return; }
    console.log('[DJ Live] Query: /api/youtube/channel', { handle: handle || null, channelId: channelId || null });
    handleYouTubeChannel(req, res, ref);
    return;
  }

  if (parsed.pathname === '/api/youtube') {
    const q = parsed.searchParams.get('q');
    if (!q) { res.writeHead(400); res.end('Missing q param'); return; }
    console.log('[DJ Live] Query: /api/youtube', q);
    handleYouTubeSearch(req, res, q);
    return;
  }

  /* Proxy for YouTube (avoids CORS on deployed sites — corsproxy.io often returns 403) */
  if (parsed.pathname === '/api/proxy') {
    let target = parsed.searchParams.get('url');
    if (!target || !/^https:\/\/(www\.)?youtube\.com\//.test(target)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Invalid or disallowed url');
    }
    console.log('[DJ Live] Query: /api/proxy', target.slice(0, 120) + (target.length > 120 ? '...' : ''));
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en'
      }
    };
    function doProxy(url, depth) {
      if (depth > 5) {
        res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        return res.end('Too many redirects');
      }
      const lib = url.startsWith('https') ? require('https') : require('http');
      lib.get(url, opts, (proxyRes) => {
        const code = proxyRes.statusCode || 0;
        if (code >= 301 && code <= 308 && proxyRes.headers.location) {
          const loc = proxyRes.headers.location;
          const next = loc.startsWith('http') ? loc : (new URL(loc, url)).href;
          if (/^https:\/\/(www\.)?youtube\.com\//.test(next)) return doProxy(next, depth + 1);
        }
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          const body = Buffer.concat(chunks);
          res.writeHead(proxyRes.statusCode || 200, {
            'Content-Type': proxyRes.headers['content-type'] || 'text/html',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(body);
        });
      }).on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Proxy error: ' + (err.message || 'fetch failed'));
      });
    }
    doProxy(target, 0);
    return;
  }

  if (parsed.pathname === '/api/reddit') {
    const q = parsed.searchParams.get('q');
    if (!q) { res.writeHead(400); res.end('Missing q param'); return; }
    console.log('[DJ Live] Query: /api/reddit', q);
    const redditUrl = 'https://www.reddit.com/search.json?q=' + encodeURIComponent(q) + '&sort=relevance&limit=10&restrict_sr=false';
    require('https').get(redditUrl, { headers: { 'User-Agent': 'DJLive/1.0' } }, (redditRes) => {
      let data = '';
      redditRes.on('data', (c) => (data += c));
      redditRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(data);
      });
    }).on('error', () => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Reddit fetch failed' }));
    });
    return;
  }

  /* Serve favicon for local dev (browsers often request /favicon.ico first) */
  const faviconPath = parsed.pathname === '/favicon.ico' ? 'favicon.png'
    : parsed.pathname === '/favicon.svg' ? 'favicon.svg'
    : parsed.pathname === '/favicon.png' ? 'favicon.png' : null;
  if (faviconPath) {
    const ct = faviconPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    serveFile(res, path.join(__dirname, faviconPath), ct);
    return;
  }

  /* Serve index.html for root (incl. Spotify callback ?code=...) and /index.html */
  const p = (parsed.pathname || '').replace(/\/+/g, '/');
  if (!p || p === '/' || p === '/index.html') {
    serveFile(res, path.join(__dirname, 'index.html'), 'text/html');
    return;
  }

  /* Debug: log unexpected paths (e.g. Spotify callback returning 404) */
  console.warn('[404] req.url=%j parsed.pathname=%j', req.url, parsed.pathname);
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  if (API_TOKEN === 'test') {
    console.warn('\n⚠️  Using AudD test token. For full recognition, add AUDD_API_TOKEN to .env\n');
  }
  console.log(`DJ Live listening at http://127.0.0.1:${PORT} (use 127.0.0.1 for Spotify login)`);
});
