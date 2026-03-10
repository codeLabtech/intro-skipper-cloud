# 📺 Intro Skipper — Cloud Edition

A self-learning Stremio addon that works on **TV, phone, and any device**.  
No local files needed. Just deploy, install, and watch — it learns automatically.

---

## How It Learns While You Watch

```
You play an episode in Stremio
        ↓
Stremio loads the "⏭ Skip Intro" subtitle track
        ↓
A tiny pixel fires back to the server → recorded as a learning signal
        ↓
After 3+ signals: Community → 🧠 Learned
After corrections: → ✏️ Corrected (most accurate)
        ↓
Next time you play the same show → more confident timestamps
```

No app. No script. No setup. Just watch.

---

## Deploy in 5 Minutes

### Option A — Railway (recommended, free tier available)

1. Go to [railway.app](https://railway.app) and sign up
2. Click **New Project → Deploy from GitHub**
3. Fork this repo or upload the files, connect it
4. Railway auto-detects Node.js and deploys
5. Go to your project → **Settings → Networking → Generate Domain**
6. Copy your domain (e.g. `https://intro-skipper-production.up.railway.app`)
7. Set environment variable: `BASE_URL` = your domain

### Option B — Render (free tier, sleeps after 15min inactivity)

1. Go to [render.com](https://render.com) and sign up
2. Click **New → Web Service → Connect GitHub**
3. Set **Start Command**: `node --experimental-sqlite server.js`
4. Set **Node Version**: `22`
5. Add a **Disk** at `/app/data` (so the database persists)
6. Set env var `BASE_URL` = your Render URL
7. Deploy

### Option C — Run locally + expose with ngrok

```bash
# Start the server
node --experimental-sqlite server.js

# In another terminal, expose it
npx ngrok http 7000

# Use the ngrok HTTPS URL as your BASE_URL
BASE_URL=https://xxxx.ngrok-free.app node --experimental-sqlite server.js
```

---

## Install in Stremio (TV, Phone, Desktop)

Once deployed, open the dashboard at your URL.  
Click **"⚡ Open in Stremio"** — or paste the manifest URL into Stremio manually:

**Stremio Desktop / Mobile:**
1. Open Stremio
2. Click the puzzle piece icon → top search bar
3. Paste: `https://YOUR-URL/manifest.json`
4. Click Install

**Stremio on TV:**
1. Open Stremio on TV
2. Go to Addons → search
3. Paste the manifest URL
4. Install

---

## Using It

1. Play any TV show in Stremio
2. During playback → open subtitle menu (💬 icon)
3. Select **"⏭ Skip Intro — 🌐 Community · 90% confidence"**
4. The subtitle track shows `[ ⏭ Opening credits ]` during the intro
5. When you see it → skip forward manually (or just let it play)

The addon works for **80+ popular shows** out of the box (see database list below).  
Don't see your show? Submit intro times via the dashboard.

---

## Adding Shows Not in the Database

Via the dashboard → **Submit Intro Times**:

| Field | Example | Notes |
|-------|---------|-------|
| IMDB Show ID | `tt0903747` | Find it in the URL on imdb.com |
| Season | `1` | Each season is tracked separately |
| Start (sec) | `8.0` | When the intro music starts |
| End (sec) | `47.0` | When the show content begins |

Or via API:
```bash
curl -X POST https://YOUR-URL/api/submit \
  -H 'Content-Type: application/json' \
  -d '{"imdbId":"tt0903747","season":1,"start":8.0,"end":47.0}'
```

---

## Sending Manual Feedback

For fine-tuning (optional — automatic tracking handles most cases):

```bash
# Skip was used ✅
curl -X POST https://YOUR-URL/api/feedback \
  -d '{"imdbId":"tt0903747","season":1,"episode":2,"action":"skip_used"}'

# Skip was wrong / ignored ❌
curl -X POST https://YOUR-URL/api/feedback \
  -d '{"imdbId":"tt0903747","season":1,"episode":2,"action":"skip_ignored"}'

# You know the correct times ✏️
curl -X POST https://YOUR-URL/api/feedback \
  -d '{"imdbId":"tt0903747","season":1,"episode":2,"action":"correction","start":10.5,"end":49.0}'
```

---

## Pre-loaded Shows

The database ships with community-sourced intro times for 80+ shows including:

Breaking Bad · Better Call Saul · Stranger Things · The Office · Friends ·
Game of Thrones · Narcos · Dark · Peaky Blinders · The Boys · Sherlock ·
The Crown · Succession · Squid Game · The Mandalorian · Chernobyl ·
True Detective · The Witcher · Dexter · Prison Break · Vikings · Lost ·
Walking Dead · Homeland · and more...

---

## Dashboard

Visit `https://YOUR-URL/` to see:
- Live stats (total intros, learned vs community, skip count)
- Full intro database with confidence scores
- Submit form for new shows
- Install link for Stremio

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7000` | HTTP port |
| `BASE_URL` | `http://localhost:7000` | Public URL (must be set for SRT links to work) |
| `HOST` | `0.0.0.0` | Bind address |

---

## Files

```
intro-skipper-cloud/
├── server.js          # HTTP server — Stremio protocol + REST API
├── src/db.js          # SQLite schema + learning engine
├── public/index.html  # Dashboard
├── railway.toml       # Railway deployment
├── render.yaml        # Render deployment  
├── Dockerfile         # Docker / any platform
└── README.md
```
