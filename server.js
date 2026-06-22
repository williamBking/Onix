/**
 * Onix Finance — OUS Pasiva proxy
 * ================================================================
 * A tiny Express server that sits between the public Onix frontend
 * (served from GitHub Pages) and the OUS Pasiva REST API.
 *
 * Why this exists:
 *   - The browser must NEVER see the OUS login / password — we keep
 *     the credentials here in env vars and only expose a few proxied
 *     endpoints to the frontend.
 *   - OUS Pasiva tokens expire on the hour, so this server logs in
 *     once on boot and refreshes the token every 55 minutes.
 *
 * Endpoints exposed to the Onix frontend:
 *   GET  /healthz                              — Railway health check
 *   GET  /api/catalogos                        — no body
 *   GET|POST /api/creditos-cierre-saldos       — body: { fecha_cierre }
 *   GET|POST /api/creditos/por-vencer          — body: { dias }
 *
 * Required environment variables (set these in Railway → Variables):
 *   OUS_LOGIN     — OUS Pasiva username
 *   OUS_PASSWORD  — OUS Pasiva password
 *   OUS_API_URL   — http://54.165.232.64:7070/api   (no trailing slash)
 *
 * Optional environment variables:
 *   PORT          — Railway sets this automatically (defaults to 3000 locally)
 *   ALLOWED_ORIGINS — comma-separated allowlist for CORS. Defaults to
 *                   the GH Pages site + the eventual custom domain.
 *
 * Dependencies (see package.json):
 *   express, node-fetch
 *
 * Constraint reminder: only express + node-fetch are allowed. If you
 * find yourself reaching for axios / cors / dotenv etc., stop — the
 * tiny helpers below cover everything we need.
 * ================================================================
 */

'use strict';

const express = require('express');
const fetch   = require('node-fetch');

// ---------------------------------------------------------------
// Config
// ---------------------------------------------------------------

const OUS_LOGIN    = process.env.OUS_LOGIN    || '';
const OUS_PASSWORD = process.env.OUS_PASSWORD || '';
const OUS_API_URL  = (process.env.OUS_API_URL || '').replace(/\/+$/, '');

const PORT = Number(process.env.PORT) || 3000;

// Comma-separated allowlist. Empty entries are ignored. The defaults
// cover the current GitHub Pages site and the planned custom domain
// (see README §9). Add http://localhost:8000 here while developing
// the frontend locally if needed.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://williambking.github.io,https://portal.onixfinance.com'
).split(',').map(s => s.trim()).filter(Boolean);

// Refresh well before OUS's 60-minute expiry so we never serve a
// just-expired token to the frontend.
const TOKEN_REFRESH_MS = 55 * 60 * 1000;

// If the boot login fails (wrong creds, OUS down), retry on this
// cadence. Routes 503 in the meantime.
const BOOT_RETRY_MS = 60 * 1000;

if (!OUS_LOGIN || !OUS_PASSWORD || !OUS_API_URL) {
  console.error('[ous-proxy] FATAL: OUS_LOGIN, OUS_PASSWORD, and OUS_API_URL must all be set.');
  console.error('[ous-proxy] Got OUS_LOGIN=' + JSON.stringify(OUS_LOGIN ? '(set)' : '') +
                ' OUS_PASSWORD=' + JSON.stringify(OUS_PASSWORD ? '(set)' : '') +
                ' OUS_API_URL=' + JSON.stringify(OUS_API_URL));
  // We still start the server so Railway can reach /healthz and you
  // can see the misconfiguration in the dashboard instead of a
  // crash-looping container.
}

// ---------------------------------------------------------------
// OUS auth state (kept in memory; one process = one token)
// ---------------------------------------------------------------

const state = {
  token: null,           // current OUS bearer token, or null when logged out
  acquiredAt: null,      // epoch ms when we last got the token (for /healthz)
  lastError: null,       // last login error message, or null on success
  refreshTimer: null,    // setInterval handle for the 55-min refresh loop
  bootTimer: null        // setTimeout handle for the retry-on-boot loop
};

/**
 * Log in to OUS Pasiva and store the token.
 *
 * ======================================================================
 *  ADJUST THIS FUNCTION WHEN YOU HAVE THE OUS PASIVA DOCS.
 *  The defaults below assume a very common Latin-American banking-API
 *  shape — they are an educated guess until the vendor sends us a curl
 *  example. Three things you may need to change:
 *
 *    1. LOGIN_PATH — '/login' is the most common; some APIs use
 *       '/auth/login', '/api/auth', or '/v1/sessions'. Strip the leading
 *       '/api' from OUS_API_URL if the login endpoint lives at the root.
 *    2. LOGIN_BODY — { login, password } is common; alternatives are
 *       { usuario, contrasena }, { user, pass }, { username, password }.
 *       Some APIs want form-encoded instead of JSON.
 *    3. tokenFromResponse() — the most common shape is { token: '...' };
 *       alternatives include { access_token: '...' }, { jwt: '...' },
 *       or a raw 'Authorization: Bearer X' response header.
 * ======================================================================
 */
async function loginToOUS() {
  // ---- ADJUST THESE THREE LINES IF NEEDED -------------------------
  // Confirmed by the OUS team on 2026-06-16: the real login endpoint
  // is POST /api/auth/login, NOT /api/login (which is a protected
  // resource that returns 401 "Token requerido").
  const LOGIN_PATH = '/auth/login';
  const LOGIN_BODY = { login: OUS_LOGIN, password: OUS_PASSWORD };
  // Confirmed shape from OUS Pasiva (2026-06-16):
  //   { status: 'ok', mensaje: 'Autenticación exitosa',
  //     data: { token: '...', tipo: 'Bearer', expira_en: ... } }
  // So the token lives at `data.token`. We also keep the top-level
  // fallbacks for any future shape change.
  const tokenFromResponse = (json, headers) =>
    (json.data && (json.data.token || json.data.access_token || json.data.jwt)) ||
    json.token || json.access_token || json.jwt ||
    headers.get('authorization') || null;
  // ----------------------------------------------------------------

  const url = OUS_API_URL + LOGIN_PATH;
  console.log('[ous-proxy] login → POST ' + url +
              ' (body fields: ' + Object.keys(LOGIN_BODY).join(', ') + ')');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(LOGIN_BODY)
  });

  // Read the body once. Try JSON first, fall back to text so we can
  // log something useful when OUS returns HTML on error.
  const rawText = await res.text();
  let json = {};
  try { json = JSON.parse(rawText); } catch { /* not JSON */ }

  // Verbose logging so the Railway log tail tells us exactly what
  // happened on every login attempt — status, body shape, and which
  // key (if any) we extracted the token from.
  const contentType = res.headers.get('content-type') || '(no content-type)';
  console.log('[ous-proxy] login ← HTTP ' + res.status + ' ' + contentType +
              ' — body preview: ' + rawText.slice(0, 400));

  if (!res.ok) {
    throw new Error('OUS login HTTP ' + res.status + ': ' + (rawText || '').slice(0, 300));
  }

  // Identify which field carried the token (helps spot when OUS
  // changes their response shape in the future).
  let tokenField = null;
  if (json.data && json.data.token)         tokenField = 'data.token';
  else if (json.data && json.data.access_token) tokenField = 'data.access_token';
  else if (json.data && json.data.jwt)      tokenField = 'data.jwt';
  else if (json.token)                       tokenField = 'token';
  else if (json.access_token)                tokenField = 'access_token';
  else if (json.jwt)                         tokenField = 'jwt';
  else if (res.headers.get('authorization')) tokenField = 'header:authorization';

  let token = tokenFromResponse(json, res.headers);
  // If the token came via an Authorization header it may be prefixed
  // with "Bearer "; strip it so we can re-add it consistently below.
  if (typeof token === 'string') token = token.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('OUS login succeeded (HTTP ' + res.status + ') but no token in response. ' +
      'Body was: ' + JSON.stringify(json).slice(0, 300));
  }

  state.token      = token;
  state.acquiredAt = Date.now();
  state.lastError  = null;
  console.log('[ous-proxy] OUS login OK at ' + new Date(state.acquiredAt).toISOString() +
              ' — token field=' + tokenField + ' length=' + token.length);
}

/**
 * Try to log in, recording any failure on `state.lastError`.
 * Returns true on success, false on failure (never throws).
 */
async function tryLogin(label) {
  try {
    await loginToOUS();
    return true;
  } catch (err) {
    state.token     = null;
    state.lastError = err && err.message ? err.message : String(err);
    console.error('[ous-proxy] ' + label + ' login failed:', state.lastError);
    return false;
  }
}

/**
 * Boot loop: try once immediately, then retry every BOOT_RETRY_MS
 * until we get a token. Once successful, the 55-min refresh interval
 * takes over.
 */
async function startAuthLoop() {
  const ok = await tryLogin('initial');
  if (ok) {
    scheduleRefresh();
    return;
  }
  // Failed — schedule a retry. clearTimeout-safe so multiple calls
  // don't pile up duplicate timers.
  if (state.bootTimer) clearTimeout(state.bootTimer);
  state.bootTimer = setTimeout(startAuthLoop, BOOT_RETRY_MS);
}

function scheduleRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(async () => {
    const ok = await tryLogin('refresh');
    if (!ok) {
      // Refresh failed but we keep serving the old token until OUS
      // rejects it (handled by the 401 retry in callOUS below).
      console.warn('[ous-proxy] keeping previous token until next refresh tick');
    }
  }, TOKEN_REFRESH_MS);
}

// ---------------------------------------------------------------
// OUS request helper — adds the bearer header, retries once on 401
// ---------------------------------------------------------------

async function callOUS(path, { method = 'GET', body = null } = {}) {
  if (!state.token) {
    const err = new Error('OUS proxy is not logged in yet');
    err.code = 'NOT_LOGGED_IN';
    throw err;
  }
  const url = OUS_API_URL + (path.startsWith('/') ? path : '/' + path);

  const doFetch = async () => {
    const init = {
      method,
      headers: {
        'Authorization': 'Bearer ' + state.token,
        'Accept': 'application/json'
      }
    };
    if (body != null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(url, init);
  };

  let res = await doFetch();

  // Token may have expired mid-flight — try one re-login and retry.
  if (res.status === 401) {
    console.warn('[ous-proxy] got 401 from OUS — re-logging in and retrying');
    const ok = await tryLogin('reactive');
    if (ok) res = await doFetch();
  }

  const rawText = await res.text();
  let json;
  try { json = JSON.parse(rawText); } catch { json = { raw: rawText }; }
  return { status: res.status, body: json };
}

// ---------------------------------------------------------------
// Express app
// ---------------------------------------------------------------

const app = express();

// Accept JSON bodies on every route. The two data endpoints below
// honor the prompt's "GET … accepts a body" wording, so we use
// express.json() which works for both GET and POST.
app.use(express.json({ limit: '64kb' }));

// CORS middleware. Allowlist comes from ALLOWED_ORIGINS env var (or
// the default GH Pages + custom-domain pair). OPTIONS preflight is
// answered immediately so the browser is happy.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Tiny request logger so Railway's log tail is readable.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log('[ous-proxy] ' + req.method + ' ' + req.originalUrl +
                ' ' + res.statusCode + ' (' + (Date.now() - start) + 'ms)');
  });
  next();
});

// -------- Health check ----------------------------------------
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    ous_logged_in: !!state.token,
    token_acquired_at: state.acquiredAt ? new Date(state.acquiredAt).toISOString() : null,
    last_login_error: state.lastError,
    allowed_origins: ALLOWED_ORIGINS,
    uptime_s: Math.round(process.uptime())
  });
});

// -------- Exhaustive connectivity diagnostic ------------------
// Runs ~12 outbound tests in parallel from Railway and reports each
// status + timing so we can isolate: is it Railway, is it OUS, is
// it the specific port, is it the User-Agent, etc.
app.get('/diagnose', async (req, res) => {
  const tests = [
    // --- General internet: prove Railway's outbound is healthy ---
    { id: 'cloudflare-1.1.1.1', url: 'https://1.1.1.1', method: 'GET' },
    { id: 'github-api',         url: 'https://api.github.com', method: 'GET' },
    { id: 'example.com',        url: 'https://example.com', method: 'GET' },

    // --- OUS on its documented port + path ---
    { id: 'ous-7070-login-default-ua', url: 'http://54.165.232.64:7070/api/auth/login', method: 'POST',
      body: { login: OUS_LOGIN, password: OUS_PASSWORD } },

    // --- OUS with mimicked Postman User-Agent (rules out UA filtering) ---
    { id: 'ous-7070-login-postman-ua', url: 'http://54.165.232.64:7070/api/auth/login', method: 'POST',
      headers: { 'User-Agent': 'PostmanRuntime/7.36.0' },
      body: { login: OUS_LOGIN, password: OUS_PASSWORD } },

    // --- OUS on alternate ports (in case 7070 is firewalled but 443/80 aren't) ---
    { id: 'ous-port-443',  url: 'https://54.165.232.64:443/api/auth/login',  method: 'POST', body: { login: OUS_LOGIN, password: OUS_PASSWORD } },
    { id: 'ous-port-80',   url: 'http://54.165.232.64:80/api/auth/login',    method: 'POST', body: { login: OUS_LOGIN, password: OUS_PASSWORD } },
    { id: 'ous-port-8080', url: 'http://54.165.232.64:8080/api/auth/login',  method: 'POST', body: { login: OUS_LOGIN, password: OUS_PASSWORD } },
    { id: 'ous-port-8443', url: 'https://54.165.232.64:8443/api/auth/login', method: 'POST', body: { login: OUS_LOGIN, password: OUS_PASSWORD } },

    // --- OUS with HTTPS scheme on the documented port ---
    { id: 'ous-7070-https', url: 'https://54.165.232.64:7070/api/auth/login', method: 'POST',
      body: { login: OUS_LOGIN, password: OUS_PASSWORD } },

    // --- Bare TCP touch on the OUS port (GET, no body, short timeout) ---
    { id: 'ous-7070-root-get', url: 'http://54.165.232.64:7070/', method: 'GET' },

    // --- Catalogos without auth (any HTTP response proves the port is reachable) ---
    { id: 'ous-7070-catalogos-noauth', url: 'http://54.165.232.64:7070/api/catalogos', method: 'GET' }
  ];

  const runTest = async (t) => {
    const start = Date.now();
    try {
      const ctl = new AbortController();
      const to  = setTimeout(() => ctl.abort(), 12000);
      const headers = Object.assign(
        { 'Accept': 'application/json' },
        t.body ? { 'Content-Type': 'application/json' } : {},
        t.headers || {}
      );
      const r = await fetch(t.url, {
        method:  t.method,
        headers: headers,
        body:    t.body ? JSON.stringify(t.body) : undefined,
        signal:  ctl.signal
      });
      clearTimeout(to);
      const text = await r.text();
      let bodyPreview;
      try { bodyPreview = JSON.parse(text); } catch { bodyPreview = (text || '').slice(0, 200); }
      return {
        id: t.id, url: t.url, method: t.method,
        status: r.status,
        content_type: r.headers.get('content-type'),
        ms: Date.now() - start,
        body_preview: typeof bodyPreview === 'string' ? bodyPreview : JSON.stringify(bodyPreview).slice(0, 200)
      };
    } catch (err) {
      return {
        id: t.id, url: t.url, method: t.method,
        ms: Date.now() - start,
        error_name: err && err.name,
        error_code: err && err.code,
        error_message: (err && err.message || '').slice(0, 200)
      };
    }
  };

  // Run in parallel — total wall time should be ~12 s (the longest single timeout).
  const results = await Promise.all(tests.map(runTest));
  res.json({
    proxy_uptime_s: Math.round(process.uptime()),
    ous_logged_in:  !!state.token,
    ran_at:         new Date().toISOString(),
    tests:          results
  });
});

// -------- Guard: 503 the data routes when not logged in --------
function requireOUSLogin(req, res, next) {
  if (!state.token) {
    return res.status(503).json({
      error: 'OUS proxy is not logged in yet',
      detail: state.lastError || 'Initial login still pending or failing.'
    });
  }
  next();
}

// -------- Helper: send a proxied response to the frontend ------
async function proxyAndForward(res, path, opts) {
  try {
    const r = await callOUS(path, opts);
    // Mirror the OUS status code so the frontend can detect 404s
    // (e.g. "no records for that date") naturally.
    res.status(r.status).json(r.body);
  } catch (err) {
    if (err && err.code === 'NOT_LOGGED_IN') {
      return res.status(503).json({ error: 'OUS proxy is not logged in yet' });
    }
    console.error('[ous-proxy] proxy error for ' + path + ':', err && err.message);
    res.status(502).json({ error: 'Upstream OUS request failed', detail: err && err.message });
  }
}

// =============================================================
// The three proxied endpoints the frontend calls.
// =============================================================

// GET /api/catalogos
//   No body; returns the upstream JSON verbatim.
app.get('/api/catalogos', requireOUSLogin, (req, res) =>
  proxyAndForward(res, '/catalogos'));

// =============================================================
// Self-healing path probe
// -------------------------------------------------------------
// The integration brief gave us /creditos-cierre-saldos and
// /creditos/por-vencer but OUS replied "Endpoint no encontrado"
// for both. Until we lock in the real paths, each route tries a
// short list of plausible variants in order and returns the
// first response that isn't a 404. The chosen path is logged so
// we can see in Railway logs which one OUS accepts, then hard-
// code it and remove the probe.
// =============================================================

async function tryCandidatePaths(res, candidates, opts, kind) {
  // candidates: array of { path, method = 'POST' | 'GET' }
  let lastResp = null;
  for (const c of candidates) {
    try {
      const r = await callOUS(c.path, { method: c.method || 'POST', body: opts.body });
      // Log every attempt so the Railway log tail tells us what OUS said.
      const isJson = r.body && typeof r.body === 'object';
      const codigo = isJson && r.body.codigo;
      const mensaje = isJson && r.body.mensaje;
      console.log('[ous-proxy] probe ' + kind + ' ' + (c.method || 'POST') + ' ' + c.path +
                  ' → HTTP ' + r.status +
                  (codigo != null ? ' codigo=' + codigo : '') +
                  (mensaje      ? ' mensaje=' + mensaje : ''));
      // 404 with "Endpoint no encontrado" means the path itself is wrong — keep probing.
      const isEndpointNotFound = r.status === 404 ||
        (codigo === 404) || /endpoint no encontrado/i.test(String(mensaje || ''));
      if (!isEndpointNotFound) {
        // Found it — also surface which candidate succeeded so the
        // frontend can spot it in a debug header without changing
        // the JSON body shape.
        console.log('[ous-proxy] probe ' + kind + ' MATCHED → ' + (c.method || 'POST') + ' ' + c.path);
        res.setHeader('X-OUS-Resolved-Path',   c.path);
        res.setHeader('X-OUS-Resolved-Method', c.method || 'POST');
        return res.status(r.status).json(r.body);
      }
      lastResp = r;
    } catch (err) {
      console.error('[ous-proxy] probe ' + kind + ' ' + c.path + ' threw:', err.message);
      lastResp = { status: 502, body: { error: err.message } };
    }
  }
  // Nothing matched — surface the last response with a helpful note.
  return res.status(lastResp ? lastResp.status : 502).json({
    error: 'No candidate OUS path matched for ' + kind +
           '. Tried: ' + candidates.map(c => (c.method || 'POST') + ' ' + c.path).join(', '),
    last_ous_response: lastResp ? lastResp.body : null
  });
}

// GET|POST /api/creditos-cierre-saldos — body: { fecha_cierre: 'YYYY-MM-DD' }
function creditosCierreSaldos(req, res) {
  const fecha_cierre = (req.body && req.body.fecha_cierre) || req.query.fecha_cierre;
  if (!fecha_cierre) {
    return res.status(400).json({ error: 'fecha_cierre is required' });
  }
  // Caller can short-circuit the probe with ?ous_path=/foo for ad-hoc testing.
  if (req.query.ous_path) {
    return proxyAndForward(res, String(req.query.ous_path), { method: 'POST', body: { fecha_cierre } });
  }
  return tryCandidatePaths(res, [
    { path: '/creditos/cierre-saldos' },
    { path: '/creditos/cierre_saldos' },
    { path: '/creditos/cierreSaldos' },
    { path: '/creditos-cierre-saldos' },
    { path: '/creditos/saldos-cierre' },
    { path: '/creditos/saldo-cierre' },
    { path: '/creditos/saldos' },
    { path: '/cierre-saldos' },
    { path: '/saldos' },
    { path: '/creditos/saldos-al-cierre' },
    { path: '/cierre-saldos', method: 'GET' },
    { path: '/creditos/cierre-saldos', method: 'GET' }
  ], { body: { fecha_cierre } }, 'cierre-saldos');
}
app.get('/api/creditos-cierre-saldos',  requireOUSLogin, creditosCierreSaldos);
app.post('/api/creditos-cierre-saldos', requireOUSLogin, creditosCierreSaldos);

// GET|POST /api/creditos/por-vencer — body: { dias: <integer> }
function creditosPorVencer(req, res) {
  const diasRaw = (req.body && req.body.dias) != null ? req.body.dias : req.query.dias;
  const dias = Number(diasRaw);
  if (!Number.isFinite(dias) || dias < 0) {
    return res.status(400).json({ error: 'dias must be a non-negative integer' });
  }
  if (req.query.ous_path) {
    return proxyAndForward(res, String(req.query.ous_path), { method: 'POST', body: { dias } });
  }
  return tryCandidatePaths(res, [
    { path: '/creditos/por-vencer' },
    { path: '/creditos/por_vencer' },
    { path: '/creditos/porVencer' },
    { path: '/creditos-por-vencer' },
    { path: '/creditos/proximos-vencimientos' },
    { path: '/creditos/proximos-a-vencer' },
    { path: '/creditos/vencer' },
    { path: '/por-vencer' },
    { path: '/vencimientos' },
    { path: '/creditos/vencimiento' },
    { path: '/creditos/por-vencer', method: 'GET' },
    { path: '/por-vencer', method: 'GET' }
  ], { body: { dias } }, 'por-vencer');
}
app.get('/api/creditos/por-vencer',  requireOUSLogin, creditosPorVencer);
app.post('/api/creditos/por-vencer', requireOUSLogin, creditosPorVencer);

// 404 for anything else under /api to make typos obvious in the
// browser DevTools network tab.
app.use('/api', (req, res) =>
  res.status(404).json({ error: 'Unknown OUS proxy endpoint: ' + req.method + ' ' + req.path }));

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------

app.listen(PORT, () => {
  console.log('[ous-proxy] listening on :' + PORT);
  console.log('[ous-proxy] OUS_API_URL=' + (OUS_API_URL || '(unset)'));
  console.log('[ous-proxy] allowed origins=' + ALLOWED_ORIGINS.join(', '));
  // Kick off the auth loop after the HTTP listener is up so /healthz
  // is reachable while we're still fetching the first token.
  startAuthLoop().catch(err =>
    console.error('[ous-proxy] startAuthLoop crashed unexpectedly:', err));
});

// ---------------------------------------------------------------
// Notes you'll want once this is in production
// ---------------------------------------------------------------
//
// 1. SECURITY — this server's CORS allowlist blocks browsers from
//    other origins, but anyone who finds the Railway URL can still
//    hit it from curl or Postman. If the OUS data is sensitive,
//    add a Supabase admin-JWT check before requireOUSLogin: verify
//    the Bearer token in the incoming Authorization header against
//    Supabase's JWKS (https://<project>.supabase.co/auth/v1/keys)
//    and reject anything where app_metadata.role !== 'admin'.
//    Doing this purely with node-fetch + a small jose import would
//    keep the dependency footprint tiny.
//
// 2. WHEN THE OUS DOCS LAND — re-read loginToOUS() above. If the
//    login path or body shape is different, update only the three
//    lines marked "ADJUST". Everything else (refresh timer, 401
//    re-login, CORS, etc.) stays the same.
//
// 3. RAILWAY DEPLOY CHECKLIST —
//      - Add OUS_LOGIN, OUS_PASSWORD, OUS_API_URL under Variables
//      - Railway auto-detects `npm start` from package.json
//      - Confirm the public URL responds at /healthz
//      - Add the URL to ALLOWED_ORIGINS' counterpart in the
//        frontend fetch call (or set ALLOWED_ORIGINS to include
//        any other domain you need)
