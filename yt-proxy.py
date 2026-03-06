#!/usr/bin/env python3
"""Tiny YouTube search proxy — run: python3 yt-proxy.py
Serves on http://localhost:3001 with CORS enabled"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.parse import parse_qs, urlparse, quote_plus
import json, re

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        self.end_headers()

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query).get('q', [''])[0]
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if not q:
            return self.wfile.write(b'[]')
        try:
            url = 'https://www.youtube.com/results?search_query=' + quote_plus(q)
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en'})
            html = urlopen(req, timeout=8).read().decode('utf-8', errors='ignore')
            m = re.search(r'var ytInitialData = (\{.*?\});', html)
            if not m:
                return self.wfile.write(b'[]')
            data = json.loads(m.group(1))
            sections = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents']
            results = []
            for sec in sections:
                for it in sec.get('itemSectionRenderer', {}).get('contents', []):
                    vr = it.get('videoRenderer')
                    if not vr or not vr.get('videoId'):
                        continue
                    results.append({
                        'id': vr['videoId'],
                        'title': (vr.get('title', {}).get('runs') or [{}])[0].get('text', ''),
                        'channel': (vr.get('ownerText', {}).get('runs') or [{}])[0].get('text', '')
                    })
            self.wfile.write(json.dumps(results[:20]).encode())
        except Exception:
            self.wfile.write(b'[]')

    def log_message(self, fmt, *args):
        print(f'[YT Proxy] {args[0]}')

print('[YT Proxy] http://localhost:3001 — ready')
HTTPServer(('', 3001), Handler).serve_forever()
