// Authenticated reader for the `debug_logs` collection.
//
// Replaces readDebugLogs.mjs, which used an UNAUTHENTICATED REST call and has been
// dead since the rules were tightened to `allow read: if isAdmin()` (it now returns
// HTTP 403 for every query). This reads through the Google Cloud Firestore REST API
// with an IAM access token instead: IAM-authorised access bypasses security rules
// entirely, so it works regardless of how the client-facing rules are written.
//
// Requires: gcloud application-default credentials (already present on this machine).
//
// Usage:
//   node scripts/readLogs.mjs                     -> last 100, chronological
//   node scripts/readLogs.mjs --scope AUTH        -> only scope=AUTH
//   node scripts/readLogs.mjs --since 5m          -> last 5 minutes (s/m/h)
//   node scripts/readLogs.mjs --limit 300
//   node scripts/readLogs.mjs --grep "check-in"   -> substring match on message
//   node scripts/readLogs.mjs --follow            -> poll for new events
//   node scripts/readLogs.mjs --scopes            -> list scopes seen, with counts
import { execFileSync } from 'node:child_process';

const PROJECT = 'place2meet';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : (i !== -1 ? true : fallback);
}

function token() {
  // gcloud lives outside PATH on some shells here; fall back to the known location.
  // shell:true is REQUIRED on Windows — gcloud ships as a .cmd, which CreateProcess
  // cannot execute directly, so execFileSync without it fails with ENOENT/EINVAL.
  const candidates = ['gcloud.cmd', 'gcloud', 'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd'];
  for (const c of candidates) {
    try {
      const t = execFileSync(c, ['auth', 'print-access-token'], {
        encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (t) return t;
    } catch { /* try next */ }
  }
  throw new Error('Could not obtain an access token via gcloud. Run: gcloud auth application-default login');
}

function parseSince(s) {
  if (!s || s === true) return null;
  const m = /^(\d+)([smh])$/.exec(s);
  if (!m) throw new Error(`--since expects e.g. 30s, 5m, 2h (got "${s}")`);
  const mult = { s: 1000, m: 60_000, h: 3_600_000 }[m[2]];
  return new Date(Date.now() - Number(m[1]) * mult);
}

// Firestore's REST value union -> plain JS.
function decode(v) {
  if (!v || typeof v !== 'object') return v ?? null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) {
    return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  }
  return null;
}

async function fetchLogs(accessToken, { since, limit }) {
  const filters = [];
  if (since) {
    filters.push({
      fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'GREATER_THAN', value: { timestampValue: since.toISOString() } },
    });
  }
  const structuredQuery = {
    from: [{ collectionId: 'debug_logs' }],
    orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
    limit,
    ...(filters.length ? { where: { compositeFilter: { op: 'AND', filters } } } : {}),
  };

  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);

  return (await r.json())
    .filter((row) => row.document)
    .map((row) => {
      const f = row.document.fields ?? {};
      return {
        id: row.document.name.split('/').pop(),
        ts: decode(f.timestamp),
        scope: decode(f.scope) ?? '?',
        message: decode(f.message) ?? '',
        uid: decode(f.uid),
        payload: decode(f.payload),
      };
    })
    .reverse(); // chronological
}

function render(e) {
  const t = e.ts ? new Date(e.ts).toISOString().slice(11, 23) : '--:--:--.---';
  const uid = e.uid ? ` uid=${String(e.uid).slice(0, 6)}` : '';
  let p = '';
  if (e.payload !== null && e.payload !== undefined && e.payload !== '') {
    p = typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload);
    if (p.length > 400) p = p.slice(0, 400) + '…';
    p = ' ' + p;
  }
  return `${t} [${e.scope}]${uid} ${e.message}${p}`;
}

const accessToken = token();
const scopeFilter = arg('scope');
const grep = arg('grep');
const limit = Number(arg('limit', 100)) || 100;
const since = parseSince(arg('since'));

function apply(events) {
  return events
    .filter((e) => scopeFilter === null || scopeFilter === true || e.scope === scopeFilter)
    .filter((e) => grep === null || grep === true || `${e.message} ${JSON.stringify(e.payload)}`.toLowerCase().includes(String(grep).toLowerCase()));
}

if (arg('scopes')) {
  const events = await fetchLogs(accessToken, { since, limit: 1000 });
  const counts = new Map();
  for (const e of events) counts.set(e.scope, (counts.get(e.scope) ?? 0) + 1);
  for (const [s, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(6), s);
  console.log(`\n${events.length} events across ${counts.size} scopes`);
} else if (arg('follow')) {
  let lastTs = since ?? new Date();
  console.log(`following debug_logs (scope=${scopeFilter || '*'}) — Ctrl-C to stop`);
  for (;;) {
    const fresh = apply(await fetchLogs(accessToken, { since: lastTs, limit: 300 }));
    for (const e of fresh) {
      console.log(render(e));
      if (e.ts && new Date(e.ts) > lastTs) lastTs = new Date(e.ts);
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
} else {
  const events = apply(await fetchLogs(accessToken, { since, limit }));
  for (const e of events) console.log(render(e));
  console.log(`---\n${events.length} events${scopeFilter && scopeFilter !== true ? ` (scope=${scopeFilter})` : ''}${since ? ` since ${since.toISOString()}` : ''}`);
}
