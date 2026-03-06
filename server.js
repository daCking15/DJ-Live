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

function handleYouTubeSearch(req, res, query) {
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  require('https').get(url, (ytRes) => {
    let html = '';
    ytRes.on('data', c => html += c);
    ytRes.on('end', () => {
      const m = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(m ? { videoId: m[1] } : { videoId: null }));
    });
  }).on('error', () => {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'YouTube fetch failed' }));
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = new URL(req.url, 'http://localhost');

  if (parsed.pathname === '/api/recognize') {
    handleRecognize(req, res);
    return;
  }

  if (parsed.pathname === '/api/youtube') {
    const q = parsed.searchParams.get('q');
    if (!q) { res.writeHead(400); res.end('Missing q param'); return; }
    handleYouTubeSearch(req, res, q);
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    serveFile(res, path.join(__dirname, 'index.html'), 'text/html');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  if (API_TOKEN === 'test') {
    console.warn('\n⚠️  Using AudD test token. For full recognition, add AUDD_API_TOKEN to .env\n');
  }
  console.log(`DJ Live listening at http://localhost:${PORT}`);
});
