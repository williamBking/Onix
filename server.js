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
 *   - OUS Pasiva tokens expire on the hour. This server logs in once
 *     on boot. It does NOT refresh on a timer — the OUS team asked us
 *     to stop creating fresh sessions every 55 minutes because each
 *     login showed up in their audit log. Instead, callOUS retries
 *     reactively when OUS returns 401 (so the first request after
 *     token expiry triggers a single re-login, not 24/day).
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
// Built-in Node modules — used for GET-with-body, which both
// node-fetch and the WHATWG fetch refuse to do despite the HTTP
// spec allowing it. Counts as a built-in, not an added dependency.
const http  = require('http');
const https = require('https');
const { URL } = require('url');

// ---------------------------------------------------------------
// Config
// ---------------------------------------------------------------

const OUS_LOGIN    = process.env.OUS_LOGIN    || '';
const OUS_PASSWORD = process.env.OUS_PASSWORD || '';
const OUS_API_URL  = (process.env.OUS_API_URL || '').replace(/\/+$/, '');

// Supabase auth gate for /api/* — validates each request's Supabase
// session token against Supabase's /auth/v1/user endpoint so the public
// Railway URL stops being an open back door into the OUS data. We use
// the user endpoint rather than verifying the JWT locally because
// Supabase projects can sign tokens with either HS256 (legacy shared
// secret) or asymmetric algorithms like ES256 — the user endpoint
// validates them all and saves us a dependency.
//
// SUPABASE_URL + SUPABASE_ANON_KEY power both the auth check and the
// per-request role lookup against the public.profiles table.
const SUPABASE_URL        = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY   = process.env.SUPABASE_ANON_KEY || '';

const PORT = Number(process.env.PORT) || 3000;

// Comma-separated allowlist. Empty entries are ignored. The defaults
// cover the current GitHub Pages site and the planned custom domain
// (see README §9). Add http://localhost:8000 here while developing
// the frontend locally if needed.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://williambking.github.io,https://portal.onixfinance.com'
).split(',').map(s => s.trim()).filter(Boolean);

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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[ous-proxy] FATAL: SUPABASE_URL / SUPABASE_ANON_KEY not set — /api/* will reject every request with 503. ' +
                'Set both in Railway → Variables: SUPABASE_URL=https://<project>.supabase.co and ' +
                'SUPABASE_ANON_KEY=<eyJ... from Supabase → Settings → API → API Keys>.');
}

// ---------------------------------------------------------------
// OUS auth state (kept in memory; one process = one token)
// ---------------------------------------------------------------

const state = {
  token: null,           // current OUS bearer token, or null when logged out
  acquiredAt: null,      // epoch ms when we last got the token (for /healthz)
  lastError: null,       // last login error message, or null on success
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

  // Strip the password out of anything we're about to log or throw,
  // in case OUS ever echoes the request body back in an error response.
  const redact = (s) => OUS_PASSWORD
    ? String(s).split(OUS_PASSWORD).join('[redacted]')
    : String(s);

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
              ' — body preview: ' + redact(rawText.slice(0, 400)));

  if (!res.ok) {
    throw new Error('OUS login HTTP ' + res.status + ': ' + redact((rawText || '').slice(0, 300)));
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
      'Body was: ' + redact(JSON.stringify(json).slice(0, 300)));
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
 * until we get a token. Once successful, no further proactive logins
 * are scheduled — the OUS team asked us to stop creating a fresh
 * session every 55 minutes. Token renewal happens reactively in
 * callOUS() the next time OUS returns 401, so we average one login
 * per token-expiry-window instead of one every hour regardless.
 */
async function startAuthLoop() {
  const ok = await tryLogin('initial');
  if (ok) return;
  // Failed — schedule a retry. clearTimeout-safe so multiple calls
  // don't pile up duplicate timers.
  if (state.bootTimer) clearTimeout(state.bootTimer);
  state.bootTimer = setTimeout(startAuthLoop, BOOT_RETRY_MS);
}

// ---------------------------------------------------------------
// OUS request helper — adds the bearer header, retries once on 401
// ---------------------------------------------------------------

// Low-level helper: do an HTTP request that *can* carry a body even
// when the method is GET. The HTTP spec technically allows it, but
// both the WHATWG fetch and node-fetch refuse to send it. OUS
// requires it for /creditos-cierre-saldos and /creditos/por-vencer
// (confirmed in Postman) so we drop down to Node's built-in http
// module here. Returns { status, headers, text }.
function rawHttpRequest(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const reqOpts = {
      method,
      protocol: u.protocol,
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + (u.search || ''),
      headers:  Object.assign({}, headers)
    };
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    if (payload != null) reqOpts.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        text:    Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('OUS request timed out after ' + timeoutMs + 'ms')));
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

async function callOUS(path, { method = 'GET', body = null } = {}) {
  if (!state.token) {
    const err = new Error('OUS proxy is not logged in yet');
    err.code = 'NOT_LOGGED_IN';
    throw err;
  }
  const url = OUS_API_URL + (path.startsWith('/') ? path : '/' + path);
  const baseHeaders = {
    'Authorization': 'Bearer ' + state.token,
    'Accept':        'application/json'
  };

  // GET-with-body needs the raw http path (fetch refuses). All other
  // combinations go through node-fetch which gives us nicer ergonomics.
  const useRaw = (method === 'GET' || method === 'HEAD') && body != null;

  const doRequest = async () => {
    if (useRaw) {
      const r = await rawHttpRequest(url, {
        method, body,
        headers: Object.assign({}, baseHeaders, { 'Content-Type': 'application/json' })
      });
      return { status: r.status, rawText: r.text };
    }
    const init = { method, headers: Object.assign({}, baseHeaders) };
    if (body != null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const rawText = await res.text();
    return { status: res.status, rawText };
  };

  let r = await doRequest();

  // Token may have expired mid-flight — try one re-login and retry.
  if (r.status === 401) {
    console.warn('[ous-proxy] got 401 from OUS — re-logging in and retrying');
    const ok = await tryLogin('reactive');
    if (ok) {
      baseHeaders.Authorization = 'Bearer ' + state.token;
      r = await doRequest();
    }
  }

  let json;
  try { json = JSON.parse(r.rawText); } catch { json = { raw: r.rawText }; }
  return { status: r.status, body: json };
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
    uptime_s: Math.round(process.uptime())
  });
});

// -------- Data-shape probe ------------------------------------
// Fires the same parameterized request to OUS many different ways
// and reports back what each one returns. Lets us figure out
// whether OUS reads from query, JSON body, form body, etc. without
// redeploying for every guess.
app.get('/diagnose-data', requireSupabaseAuth, requireOnixAdmin, async (req, res) => {
  if (!state.token) {
    return res.status(503).json({ error: 'OUS proxy is not logged in yet' });
  }
  const fecha_cierre = req.query.fecha_cierre || new Date().toISOString().slice(0, 10);
  const base = OUS_API_URL + '/creditos-cierre-saldos';
  const auth = 'Bearer ' + state.token;
  const formBody = 'fecha_cierre=' + encodeURIComponent(fecha_cierre);
  const jsonBody = JSON.stringify({ fecha_cierre });
  const camelJson = JSON.stringify({ fechaCierre: fecha_cierre });

  const variants = [
    // ID, method, url, headers, body
    ['GET  body=JSON',          'GET',  base,                                    { 'Content-Type': 'application/json', Accept: 'application/json' },           jsonBody],
    ['GET  body=form',          'GET',  base,                                    { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, formBody],
    ['GET  query only',         'GET',  base + '?fecha_cierre=' + fecha_cierre,  { Accept: 'application/json' },                                                null],
    ['GET  query + JSON body',  'GET',  base + '?fecha_cierre=' + fecha_cierre,  { 'Content-Type': 'application/json', Accept: 'application/json' },           jsonBody],
    ['GET  query + form body',  'GET',  base + '?fecha_cierre=' + fecha_cierre,  { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, formBody],
    ['GET  body=JSON camel',    'GET',  base,                                    { 'Content-Type': 'application/json', Accept: 'application/json' },           camelJson],
    ['POST body=JSON',          'POST', base,                                    { 'Content-Type': 'application/json', Accept: 'application/json' },           jsonBody],
    ['POST body=form',          'POST', base,                                    { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, formBody],
    ['POST query only',         'POST', base + '?fecha_cierre=' + fecha_cierre,  { Accept: 'application/json' },                                                null]
  ];

  const results = await Promise.all(variants.map(async ([id, method, url, hdrs, body]) => {
    try {
      const r = await rawHttpRequest(url, {
        method,
        headers: Object.assign({ Authorization: auth }, hdrs),
        body
      });
      return { id, status: r.status, body_preview: (r.text || '').slice(0, 200) };
    } catch (err) {
      return { id, error: (err && err.message) || String(err) };
    }
  }));
  res.json({ fecha_cierre, results });
});

// -------- Exhaustive connectivity diagnostic ------------------
// Runs ~12 outbound tests in parallel from Railway and reports each
// status + timing so we can isolate: is it Railway, is it OUS, is
// it the specific port, is it the User-Agent, etc.
app.get('/diagnose', requireSupabaseAuth, requireOnixAdmin, async (req, res) => {
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

// -------- Guard: validate the caller's Supabase session token ----
// Reads "Authorization: Bearer <jwt>" and validates it by asking
// Supabase's /auth/v1/user endpoint who it belongs to. Algorithm-
// agnostic (works for HS256, ES256, RS256). On success attaches
// req.user with { id, email, raw_token, raw_payload }. Returns 401
// on missing/invalid/expired token. This is the baseline gate —
// without it the Railway URL is an open door (see README §SECURITY).
async function requireSupabaseAuth(req, res, next) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Auth not configured — SUPABASE_URL/SUPABASE_ANON_KEY missing on server' });
  }
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Missing Authorization: Bearer <supabase access token>' });
  const token = m[1].trim();
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
        'Accept':        'application/json'
      }
    });
    if (!r.ok) {
      const body = await r.text();
      return res.status(401).json({
        error:  'Invalid or expired token',
        detail: 'Supabase /auth/v1/user returned HTTP ' + r.status + ': ' + body.slice(0, 200)
      });
    }
    const user = await r.json();
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Token did not resolve to a user' });
    }
    req.user = {
      id:          user.id,
      email:       user.email,
      raw_token:   token,
      raw_payload: user
    };
    next();
  } catch (err) {
    return res.status(503).json({ error: 'Auth check threw', detail: (err && err.message) || String(err) });
  }
}

// -------- Guard: caller's profile row must have role='admin' ----
// JWT verification alone proves the caller is *some* Supabase user,
// not that they're an Onix admin. We confirm by re-issuing their own
// JWT against the public.profiles table — RLS lets a user read their
// own profile only, which is exactly what we need. Fails closed.
async function requireOnixAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Auth required' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Admin check not configured — SUPABASE_URL/SUPABASE_ANON_KEY missing on server' });
  }
  try {
    const url = SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(req.user.id) + '&select=role,status';
    const r = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + req.user.raw_token,
        'Accept':        'application/json'
      }
    });
    if (!r.ok) {
      const body = await r.text();
      return res.status(403).json({ error: 'Profile lookup failed', detail: 'HTTP ' + r.status + ': ' + body.slice(0, 200) });
    }
    const rows = await r.json();
    const p = Array.isArray(rows) ? rows[0] : null;
    if (!p || p.role !== 'admin' || p.status !== 'active') {
      return res.status(403).json({ error: 'Admin role required' });
    }
    req.user.role   = 'admin';
    req.user.status = p.status;
    next();
  } catch (err) {
    return res.status(503).json({ error: 'Admin check threw', detail: (err && err.message) || String(err) });
  }
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
app.get('/api/catalogos', requireSupabaseAuth, requireOnixAdmin, requireOUSLogin, (req, res) =>
  proxyAndForward(res, '/catalogos'));

// =============================================================
// Data endpoints
// Confirmed via Postman 2026-06-18:
//   GET /api/creditos-cierre-saldos  + body { fecha_cierre }
//   GET /api/creditos/por-vencer     + body { dias }
// Both are GET (not POST). We pass the parameters as both a JSON
// body AND a query string so OUS accepts whichever shape it wants.
// =============================================================

function buildQuery(params) {
  const usp = new URLSearchParams();
  Object.keys(params).forEach(k => {
    if (params[k] != null) usp.append(k, String(params[k]));
  });
  const s = usp.toString();
  return s ? '?' + s : '';
}

// GET /api/creditos-cierre-saldos — { fecha_cierre: 'YYYY-MM-DD' }
// OUS reads the param from the JSON body (confirmed via Postman).
// callOUS uses Node's raw http module for GET+body since fetch refuses.
// We also append it to the query string as a no-op safety net.
function creditosCierreSaldos(req, res) {
  const fecha_cierre = (req.body && req.body.fecha_cierre) || req.query.fecha_cierre;
  if (!fecha_cierre) {
    return res.status(400).json({ error: 'fecha_cierre is required' });
  }
  return proxyAndForward(
    res,
    '/creditos-cierre-saldos' + buildQuery({ fecha_cierre }),
    { method: 'GET', body: { fecha_cierre } }
  );
}
app.get('/api/creditos-cierre-saldos',  requireSupabaseAuth, requireOnixAdmin, requireOUSLogin, creditosCierreSaldos);
app.post('/api/creditos-cierre-saldos', requireSupabaseAuth, requireOnixAdmin, requireOUSLogin, creditosCierreSaldos);

// GET /api/creditos/por-vencer — { dias: <integer> }
function creditosPorVencer(req, res) {
  const diasRaw = (req.body && req.body.dias) != null ? req.body.dias : req.query.dias;
  const dias = Number(diasRaw);
  if (!Number.isFinite(dias) || dias < 0) {
    return res.status(400).json({ error: 'dias must be a non-negative integer' });
  }
  return proxyAndForward(
    res,
    '/creditos/por-vencer' + buildQuery({ dias }),
    { method: 'GET', body: { dias } }
  );
}
app.get('/api/creditos/por-vencer',  requireSupabaseAuth, requireOnixAdmin, requireOUSLogin, creditosPorVencer);
app.post('/api/creditos/por-vencer', requireSupabaseAuth, requireOnixAdmin, requireOUSLogin, creditosPorVencer);

// GET/POST /api/my-ous-credits — available to any authenticated client
// (not admin-only). Returns only the OUS credits that belong to the
// calling user, matched by their profile's email address. Clients
// cannot see each other's data.
async function myOusCredits(req, res) {
  if (!state.token) return res.status(503).json({ error: 'OUS proxy is not logged in yet' });
  const today = new Date().toISOString().slice(0, 10);
  const fecha_cierre = (req.body && req.body.fecha_cierre) || req.query.fecha_cierre || today;

  // Look up the caller's profile to get their correo + rfc so we
  // can filter OUS results to only their credits.
  let profileEmail = req.user.email || '';
  let profileRfc   = '';
  try {
    const pUrl = SUPABASE_URL + '/rest/v1/profiles?id=eq.' + encodeURIComponent(req.user.id) + '&select=email,rfc';
    const pRes = await fetch(pUrl, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + req.user.raw_token,
        'Accept':        'application/json'
      }
    });
    if (pRes.ok) {
      const rows = await pRes.json();
      if (rows && rows[0]) {
        profileEmail = rows[0].email || profileEmail;
        profileRfc   = rows[0].rfc   || '';
      }
    }
  } catch (_) { /* fall back to auth email */ }

  // Fetch full closing-balance list from OUS, then filter server-side.
  let allCredits;
  try {
    const result = await callOUS('/creditos-cierre-saldos', {
      method: 'GET',
      body:   { fecha_cierre }
    });
    const d = result && result.data;
    allCredits = Array.isArray(d) ? d
               : (d && Array.isArray(d.creditos)) ? d.creditos
               : [];
  } catch (err) {
    return res.status(502).json({ error: 'OUS fetch failed', detail: (err && err.message) || String(err) });
  }

  const emailLower = (profileEmail || '').toLowerCase().trim();
  const rfcUpper   = (profileRfc   || '').toUpperCase().trim();
  const mine = allCredits.filter(c => {
    const cEmail = ((c.correo || '')).toLowerCase().trim();
    const cRfc   = ((c.rfc   || '')).toUpperCase().trim();
    if (rfcUpper   && cRfc   && cRfc   === rfcUpper)   return true;
    if (emailLower && cEmail && cEmail === emailLower) return true;
    return false;
  });

  res.json({ status: 'ok', data: mine, fecha_cierre, matched_by: { email: emailLower, rfc: rfcUpper } });
}
app.get('/api/my-ous-credits',  requireSupabaseAuth, requireOUSLogin, myOusCredits);
app.post('/api/my-ous-credits', requireSupabaseAuth, requireOUSLogin, myOusCredits);

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
