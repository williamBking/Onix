/**
 * Onix Finance — Railway status snapshot
 *
 * One-shot script (not a long-running server). Meant to run on Railway's
 * own Cron Schedule, twice a day, as a separate service in the same
 * Railway project as the main Onix app. Because it runs inside Railway's
 * network, it can reach the live app and Supabase without going through
 * any external egress policy — that's why this isn't a Claude Code
 * scheduled routine: those run in a sandboxed cloud environment whose
 * egress policy blocks backboard.railway.app and similar hosts.
 *
 * Checks the Onix app's own /healthz endpoint, then writes one row to
 * Supabase (public.railway_status_snapshots) recording what it found.
 *
 * Required env vars:
 *   ONIX_HEALTHZ_URL       — e.g. https://onix-production-50c3.up.railway.app/healthz
 *   SUPABASE_URL           — already set in the Railway project for the main Onix service
 *   SUPABASE_SERVICE_KEY   — Supabase "secret key" (Settings → API → Secret keys).
 *                            NOT the anon/publishable key — railway_status_snapshots only
 *                            grants INSERT to service_role, and only the secret key
 *                            authenticates as that role. Set this as its own Railway
 *                            variable; never expose it to the browser-facing code.
 */

const fetch = require('node-fetch');

const ONIX_HEALTHZ_URL     = process.env.ONIX_HEALTHZ_URL || '';
const SUPABASE_URL         = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

async function main() {
  if (!ONIX_HEALTHZ_URL || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[snapshot] Missing required env vars. Need ONIX_HEALTHZ_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }

  let deploymentStatus = 'UNREACHABLE';
  let healthBody = null;
  let healthError = null;

  try {
    const res = await fetch(ONIX_HEALTHZ_URL, { timeout: 15000 });
    healthBody = await res.json().catch(() => null);
    deploymentStatus = res.ok ? 'UP' : 'DOWN_HTTP_' + res.status;
  } catch (err) {
    healthError = String(err && err.message || err);
    console.error('[snapshot] healthz fetch failed:', healthError);
  }

  const row = {
    service_name: 'Onix',
    deployment_status: deploymentStatus,
    recent_logs: healthError ? ('healthz fetch error: ' + healthError) : JSON.stringify(healthBody),
    raw_response: { healthz: healthBody, error: healthError, checked_at: new Date().toISOString() }
  };

  const insertRes = await fetch(SUPABASE_URL + '/rest/v1/railway_status_snapshots', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(row)
  });

  if (!insertRes.ok) {
    const text = await insertRes.text().catch(() => '');
    console.error('[snapshot] Supabase insert failed:', insertRes.status, text);
    process.exit(1);
  }

  console.log('[snapshot] OK — wrote snapshot row. deployment_status=' + deploymentStatus);
}

main().catch(err => {
  console.error('[snapshot] Fatal error:', err);
  process.exit(1);
});
