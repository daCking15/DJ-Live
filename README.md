# DJ Live — Real-Time Song Recognition

A web page that uses your microphone to continuously listen for and identify songs. Powered by the [AudD Music Recognition API](https://audd.io/).

## Features

- **Continuous listening** — Records 10-second audio chunks and identifies songs in the background
- **Rich results** — Shows artist, title, album art, and links to Spotify, Apple Music, and more
- **No install** — Runs in the browser with a small Node.js server for the API proxy

## Setup

### 1. Get an AudD API token

1. Sign up at [dashboard.audd.io](https://dashboard.audd.io/)
2. AudD offers 300 free requests to get started

### 2. Configure the API token

Create a `.env` file in this directory:

```
AUDD_API_TOKEN=your_token_here
```

Or pass it when starting the server:

```bash
AUDD_API_TOKEN=your_token node server.js
```

### 3. Start the server

```bash
node server.js
```

Or with npm:

```bash
npm run dev
```

### 4. Open in the browser

Visit [http://localhost:3000](http://localhost:3000), allow microphone access when prompted, and click the microphone button to start listening.

## How it works

1. Click the mic button to grant microphone access and start listening
2. The page records ~10 seconds of audio at a time
3. Each chunk is sent to AudD for recognition
4. Identified songs appear in the list with album art and streaming links
5. Repeat — it keeps listening until you click the mic again to stop

## Project structure

```
DJ-Live/
├── index.html    # Frontend UI and mic capture
├── server.js     # Proxy server (keeps API key server-side)
├── package.json
└── README.md
```

## Notes

- **Microphone required** — The page needs access to your microphone to capture ambient audio
- **HTTPS in production** — Browsers require HTTPS for `getUserMedia` except on localhost
- **API usage** — Each 10-second chunk counts as one recognition request against your AudD quota
