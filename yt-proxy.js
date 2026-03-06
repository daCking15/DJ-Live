// Tiny YouTube search proxy — run: node yt-proxy.js
// Serves on http://localhost:3001 with CORS enabled
const http = require('http');
const https = require('https');
const PORT = 3001;

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, 'http://localhost');
  const q = u.searchParams.get('q');
  if (!q) { res.writeHead(400); return res.end('missing ?q='); }

  const ytUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  https.get(ytUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' } }, ytRes => {
    let body = '';
    ytRes.on('data', c => body += c);
    ytRes.on('end', () => {
      try {
        const m = body.match(/var ytInitialData = (\{.*?\});/);
        if (!m) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]'); }
        const data = JSON.parse(m[1]);
        const sections = data.contents.twoColumnSearchResultsRenderer
          .primaryContents.sectionListRenderer.contents;
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results.slice(0, 20)));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
      }
    });
  }).on('error', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); });
}).listen(PORT, () => console.log('[YT Proxy] http://localhost:' + PORT + ' — ready'));
