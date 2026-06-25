// Reads debug_logs from Firestore via REST (no SDK auth needed since rules
// allow public read on this collection). Usage:
//   node scripts/readDebugLogs.mjs            -> last 100 events
//   node scripts/readDebugLogs.mjs MAP        -> filter by scope
const PROJECT = 'place2meet';
const COLLECTION = 'debug_logs';
const PAGE_SIZE = 200;
const filterScope = process.argv[2];

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${COLLECTION}?pageSize=${PAGE_SIZE}&orderBy=timestamp%20desc`;

const r = await fetch(url);
if (!r.ok) {
  console.error('HTTP', r.status, await r.text());
  process.exit(1);
}
const data = await r.json();
const docs = data.documents ?? [];

const events = docs
  .map((d) => {
    const f = d.fields ?? {};
    const ts = f.timestamp?.timestampValue ?? null;
    const scope = f.scope?.stringValue ?? '?';
    const message = f.message?.stringValue ?? '';
    const uid = f.uid?.stringValue ?? null;
    const payload = decode(f.payload);
    return { ts, scope, message, uid, payload };
  })
  .filter((e) => !filterScope || e.scope === filterScope)
  .reverse(); // chronological

for (const e of events) {
  console.log(`[${e.ts}] [${e.scope}] ${e.message}`, JSON.stringify(e.payload));
}
console.log('---');
console.log(`Total: ${events.length} events${filterScope ? ` (filtered scope=${filterScope})` : ''}`);

function decode(field) {
  if (!field) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.nullValue !== undefined) return null;
  if (field.arrayValue) return (field.arrayValue.values ?? []).map(decode);
  if (field.mapValue) {
    const o = {};
    for (const [k, v] of Object.entries(field.mapValue.fields ?? {})) o[k] = decode(v);
    return o;
  }
  return field;
}
