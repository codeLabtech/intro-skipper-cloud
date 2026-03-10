#!/usr/bin/env node
// server.js — Intro Skipper Cloud Addon (v2)
//
// Stremio endpoints:
//   GET /manifest.json
//   GET /subtitles/series/{imdb}:{season}:{episode}.json
//
// Feedback (called from companion scripts or manually):
//   POST /api/feedback   { imdbId, season, episode, action, start?, end?, clientId }
//   GET  /api/intro/:imdbId/:season
//   GET  /api/stats
//   GET  /api/intros
//   POST /api/submit     Submit a new intro time (community contribution)
//
// SRT:
//   GET /srt?start=X&end=Y&imdb=Z&season=N&ep=M
//   GET /pixel.gif?...   1×1 tracking pixel — records skip/ignore passively
//
// Dashboard:
//   GET /  → dashboard

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DB } from './src/db.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT  = parseInt(process.env.PORT || '7000');
const HOST  = process.env.HOST || '0.0.0.0';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── Manifest ──────────────────────────────────────────────────────────────────

const MANIFEST = {
  id:          'community.intro-skipper.v2',
  version:     '2.0.0',
  name:        'Intro Skipper',
  description: 'Skips TV intros automatically. Community-powered, self-learning. Works on TV, phone, and desktop.',
  logo:        `${BASE_URL}/logo.png`,
  resources:   ['subtitles'],
  types:       ['series'],
  idPrefixes:  ['tt'],
  catalogs:    [],
  behaviorHints: { configurable: false, adult: false },
};

// ── Init ──────────────────────────────────────────────────────────────────────

const db = new DB('./data/intros.db');
console.log('[server] Database ready');

// ── Helpers ───────────────────────────────────────────────────────────────────

function respond(res, data, status = 200, ct = 'application/json') {
  const body = ct === 'application/json' ? JSON.stringify(data) : data;
  res.writeHead(status, {
    'Content-Type':                ct,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'*',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Cache-Control':               'no-cache',
  });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch(e) { reject(e); } });
    req.on('error', reject);
  });
}

function parseId(id) {
  // tt0903747:1:2 → { showId, season, episode }
  const [showId, season = '1', episode = '1'] = id.split(':');
  return { showId, season: parseInt(season), episode: parseInt(episode) };
}

function clientId(req) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '';
  const ua  = req.headers['user-agent'] || '';
  return createHash('sha256').update(ip + ua).digest('hex').slice(0, 16);
}

function fmtSRT(startSec, endSec, imdbId, season, episode, baseUrl) {
  const fmt = s => {
    const h   = String(Math.floor(s / 3600)).padStart(2, '0');
    const m   = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = (s % 60).toFixed(3).replace('.', ',').padStart(6, '0');
    return `${h}:${m}:${sec}`;
  };

  // Tracking pixel URLs embedded in the SRT — fires when rendered by the player
  const skipPixel   = `${baseUrl}/pixel.gif?action=skip_used&imdb=${imdbId}&season=${season}&ep=${episode}`;
  const ignorePixel = `${baseUrl}/pixel.gif?action=skip_ignored&imdb=${imdbId}&season=${season}&ep=${episode}`;

  // Two cues:
  //  1. At start: "Opening credits" label
  //  2. 3s before end: bold skip prompt
  const cue1Start = Math.max(0, startSec);
  const cue1End   = Math.min(startSec + 3, endSec);
  const cue2Start = Math.max(startSec, endSec - 8);
  const cue2End   = endSec;

  return [
    `1`,
    `${fmt(cue1Start)} --> ${fmt(cue1End)}`,
    `[ ⏭  Opening credits ]`,
    ``,
    `2`,
    `${fmt(cue2Start)} --> ${fmt(cue2End)}`,
    `⏭  Skip Intro`,
    ``,
  ].join('\n');
}

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url    = new URL(req.url, `http://${req.headers.host}`);
  const path   = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
    return res.end();
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  if (path === '/' || path === '/index.html') {
    const html = readFileSync(join(__dir, 'public', 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  // ── Manifest ───────────────────────────────────────────────────────────────
  if (path === '/manifest.json') {
    return respond(res, MANIFEST);
  }

  // ── Subtitles (core Stremio endpoint) ─────────────────────────────────────
  const subMatch = path.match(/^\/subtitles\/series\/(.+)\.json$/);
  if (subMatch) {
    const { showId, season, episode } = parseId(decodeURIComponent(subMatch[1]));
    const intro = db.getIntro(showId, season);

    if (!intro) {
      return respond(res, { subtitles: [] });
    }

    const { start_sec, end_sec, confidence, source, skip_count } = intro;
    const confPct  = Math.round(confidence * 100);
    const srcLabel = source === 'learned' ? '🧠 Learned' : source === 'corrected' ? '✏️ Corrected' : '🌐 Community';
    const srtUrl   = `${BASE_URL}/srt?start=${start_sec}&end=${end_sec}&imdb=${showId}&season=${season}&ep=${episode}`;

    console.log(`[stremio] Subtitles requested: ${showId} S${season}E${episode} → intro ${start_sec}s-${end_sec}s (${source})`);

    return respond(res, {
      subtitles: [{
        id:   `intro-${showId}-s${season}-${Math.round(start_sec)}-${Math.round(end_sec)}`,
        url:  srtUrl,
        lang: 'intro-skip',
        name: `⏭ Skip Intro — ${srcLabel} · ${confPct}% · ${skip_count} skips`,
      }]
    });
  }

  // ── SRT file ───────────────────────────────────────────────────────────────
  if (path === '/srt') {
    const start  = parseFloat(url.searchParams.get('start') || '0');
    const end    = parseFloat(url.searchParams.get('end')   || '45');
    const imdbId = url.searchParams.get('imdb')   || '';
    const season = parseInt(url.searchParams.get('season') || '1');
    const ep     = parseInt(url.searchParams.get('ep')     || '1');
    const srt    = fmtSRT(start, end, imdbId, season, ep, BASE_URL);
    return respond(res, srt, 200, 'text/plain; charset=utf-8');
  }

  // ── Tracking pixel (passive learning from TV/phone) ────────────────────────
  // The SRT file embeds <img> tags with pixel URLs. When a player renders the
  // subtitle, it fires the pixel → we record the signal.
  // This is the key "learn while watching" mechanism for dumb clients.
  if (path === '/pixel.gif') {
    const action = url.searchParams.get('action') || 'skip_used';
    const imdbId = url.searchParams.get('imdb')   || '';
    const season = parseInt(url.searchParams.get('season') || '1');
    const ep     = parseInt(url.searchParams.get('ep')     || '1');
    const cid    = clientId(req);

    if (imdbId) {
      db.recordFeedback(imdbId, season, ep, action, null, null, cid);
      console.log(`[learn] pixel: ${action} ${imdbId} S${season}E${ep} (${cid})`);
    }

    // Return a 1×1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    return res.end(gif);
  }

  // ── API: Stats ─────────────────────────────────────────────────────────────
  if (path === '/api/stats' && method === 'GET') {
    return respond(res, db.getStats());
  }

  // ── API: List intros ───────────────────────────────────────────────────────
  if (path === '/api/intros' && method === 'GET') {
    const filter = url.searchParams.get('q') || '';
    let intros = db.listIntros();
    if (filter) intros = intros.filter(i => i.imdb_id.includes(filter));
    return respond(res, intros);
  }

  // ── API: Get single intro ──────────────────────────────────────────────────
  const introMatch = path.match(/^\/api\/intro\/([^/]+)\/(\d+)$/);
  if (introMatch && method === 'GET') {
    const intro = db.getIntro(introMatch[1], parseInt(introMatch[2]));
    return respond(res, intro || { error: 'Not found' }, intro ? 200 : 404);
  }

  // ── API: Manual feedback ───────────────────────────────────────────────────
  if (path === '/api/feedback' && method === 'POST') {
    try {
      const { imdbId, season, episode, action, start, end } = await readBody(req);
      if (!imdbId || !action) return respond(res, { error: 'imdbId and action required' }, 400);
      const cid    = url.searchParams.get('clientId') || clientId(req);
      const result = db.recordFeedback(imdbId, parseInt(season), parseInt(episode), action, start, end, cid);
      return respond(res, result);
    } catch(e) {
      return respond(res, { error: e.message }, 500);
    }
  }

  // ── API: Community submit ──────────────────────────────────────────────────
  if (path === '/api/submit' && method === 'POST') {
    try {
      const { imdbId, season, start, end } = await readBody(req);
      if (!imdbId || !season || start == null || end == null)
        return respond(res, { error: 'imdbId, season, start, end required' }, 400);
      if (end - start < 5 || end - start > 300)
        return respond(res, { error: 'Intro must be 5–300 seconds long' }, 400);
      db.upsertIntro(imdbId, parseInt(season), parseFloat(start), parseFloat(end), 0.7, 'community');
      return respond(res, { ok: true });
    } catch(e) {
      return respond(res, { error: e.message }, 500);
    }
  }

  // 404
  respond(res, { error: 'Not found' }, 404);
});

server.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     📺  Intro Skipper Cloud — v2.0  Running               ║
╠═══════════════════════════════════════════════════════════╣
║  Dashboard   : ${BASE_URL.padEnd(40)} ║
║  Manifest    : ${(BASE_URL + '/manifest.json').padEnd(40)} ║
║  Stremio URL : stremio://install?url=${encodeURIComponent(BASE_URL + '/manifest.json').slice(0,20)}...  ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGINT',  () => { server.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
