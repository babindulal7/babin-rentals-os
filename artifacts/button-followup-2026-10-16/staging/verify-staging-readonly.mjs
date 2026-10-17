// Acceptance aid only. Never reads .env files, provisions identities, or writes remotely.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROLES = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'];
const MONEY = new Set(ROLES.slice(0, 5));
const PRODUCTION = 'sxguwvgoserhdolewibb';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATIONS = {
  invoices: 'id', payments: 'id', security_deposits: 'id', audit_logs: 'id',
  staff_directory_v: 'id', product_units_service_v: 'unit_id', bookings: 'id',
  products_v: 'id', booking_lines_v: 'id', bookings_deposit_v: 'id',
};
const MASKS = { products_v: ['daily_rate', 'replacement_value'], booking_lines_v: ['rate'], bookings_deposit_v: ['deposit_required'] };
const stop = () => { throw new Error('PREFLIGHT'); };
const jwt = (token) => {
  try {
    if (typeof token !== 'string' || token.split('.').length !== 3) return stop();
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch { return stop(); }
};

export function preflight(manifest, env, now = Date.now()) {
  if (manifest?.approvedStaging !== true || !/^[a-z]{20}$/.test(manifest?.projectRef ?? '') || manifest.projectRef === PRODUCTION) stop();
  const origin = `https://${manifest.projectRef}.supabase.co`;
  if (env.STAGING_SUPABASE_URL !== origin && env.STAGING_SUPABASE_URL !== `${origin}/`) stop();
  const key = env.STAGING_PUBLISHABLE_KEY;
  if (!key?.startsWith('sb_publishable_')) {
    const payload = jwt(key);
    if (payload.role !== 'anon' || payload.ref !== manifest.projectRef) stop();
  }
  const tokens = {};
  const subjects = new Set();
  for (const role of ROLES) {
    const token = env[`STAGING_JWT_${role.toUpperCase()}`];
    const payload = jwt(token);
    if (payload.role !== 'authenticated' || !UUID.test(payload.sub ?? '') || payload.iss !== `${origin}/auth/v1` ||
        !Number.isFinite(payload.exp) || payload.exp <= now / 1000 + 120 || subjects.has(payload.sub)) stop();
    subjects.add(payload.sub);
    tokens[role] = { token, subject: payload.sub };
  }
  // A fixture is required for EVERY relation tested for denial: empty tables cannot certify access control.
  for (const relation of Object.keys(RELATIONS)) {
    const id = manifest.fixtures?.[relation];
    if (!(typeof id === 'string' && (UUID.test(id) || (relation === 'audit_logs' && /^\d+$/.test(id))))) stop();
  }
  if (!UUID.test(manifest.fixtures?.clientOwnBooking ?? '') || !UUID.test(manifest.fixtures?.otherClientBooking ?? '') ||
      manifest.fixtures.clientOwnBooking === manifest.fixtures.otherClientBooking) stop();
  return { origin, key, tokens, fixtures: manifest.fixtures };
}

const permissionDenied = (r) => r.status === 403 && r.data?.code === '42501';
const exactRow = (r, key, id) => r.status === 200 && Array.isArray(r.data) && r.data.length === 1 && String(r.data[0]?.[key]) === id;
export const denied = (r, ownerControl) => ownerControl === true && (permissionDenied(r) || (r.status === 200 && Array.isArray(r.data) && r.data.length === 0));

export async function verify(config, fetcher = fetch, emit = console.log) {
  let failed = 0;
  let unverified = 0;
  const check = (name, pass) => { if (!pass) failed++; emit(`${pass ? 'PASS' : 'FAIL'} ${name}`); return pass; };
  const unknown = (name) => { unverified++; emit(`UNVERIFIED ${name}`); };
  const request = async (path, role) => {
    // Static allowlist prevents arbitrary endpoints and writable RPCs, even when imported by a caller.
    if (!/^\/auth\/v1\/user$|^\/rest\/v1\/rpc\/(auth_user_role|auth_can_view_money)$|^\/rest\/v1\/[a-z_]+\?/.test(path)) stop();
    const headers = { apikey: config.key };
    if (role) headers.Authorization = `Bearer ${config.tokens[role].token}`;
    else if (!config.key.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${config.key}`;
    try {
      const response = await fetcher(`${config.origin}${path}`, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
      return { status: response.status, data: await response.json() };
    } catch { return { status: 0, data: null }; }
  };
  const query = (relation, id, fields = [], key = RELATIONS[relation]) => {
    if (!Object.hasOwn(RELATIONS, relation) || !/^[a-z_]+$/.test(key)) stop();
    return `/rest/v1/${relation}?select=${[key, ...fields].join(',')}&${key}=eq.${encodeURIComponent(id)}&limit=2`;
  };
  // Validate actual sessions and DB roles before interpreting any permission result.
  for (const role of ROLES) {
    const user = await request('/auth/v1/user', role);
    const databaseRole = await request('/rest/v1/rpc/auth_user_role', role);
    const money = await request('/rest/v1/rpc/auth_can_view_money', role);
    const valid = user.status === 200 && user.data?.id === config.tokens[role].subject &&
      databaseRole.status === 200 && databaseRole.data === role && money.status === 200 && money.data === MONEY.has(role);
    if (!check(`${role} authenticated identity, database role and money flag`, valid)) return 1;
  }
  const controls = {};
  for (const [relation, key] of Object.entries(RELATIONS)) {
    const fields = MASKS[relation] ?? [];
    const control = await request(query(relation, config.fixtures[relation], fields), 'Owner');
    controls[relation] = exactRow(control, key, config.fixtures[relation]) && fields.every((field) => control.data[0]?.[field] != null);
    if (controls[relation]) emit(`PASS Owner positive control ${relation}`);
    else unknown(`Owner positive control ${relation}; dependent denials are not certified`);
  }
  for (const relation of Object.keys(RELATIONS)) {
    if (!controls[relation]) continue;
    check(`anon cannot read known ${relation} fixture`, denied(await request(query(relation, config.fixtures[relation])), controls[relation]));
  }
  for (const role of ROLES.filter((r) => !MONEY.has(r))) {
    for (const relation of ['invoices', 'payments', 'security_deposits']) {
      if (!controls[relation]) continue;
      check(`${role} cannot read known ${relation} fixture`, denied(await request(query(relation, config.fixtures[relation]), role), controls[relation]));
    }
    for (const [relation, fields] of Object.entries(MASKS)) {
      if (!controls[relation]) continue;
      const result = await request(query(relation, config.fixtures[relation], fields), role);
      // Client may have no row access. Staff floor roles must see the known operational row with all probed amounts null.
      const masked = exactRow(result, RELATIONS[relation], config.fixtures[relation]) && fields.every((field) => result.data[0]?.[field] === null);
      check(`${role} known ${relation} amounts masked`, masked || (role === 'Client' && denied(result, controls[relation])));
    }
  }
  // Both fixtures positively exist for Owner before the Client own/other comparison.
  const own = config.fixtures.clientOwnBooking;
  const other = config.fixtures.otherClientBooking;
  const ownControl = await request(query('bookings', own), 'Owner');
  const otherControl = await request(query('bookings', other), 'Owner');
  if (!exactRow(ownControl, 'id', own) || !exactRow(otherControl, 'id', other)) unknown('Client isolation Owner controls');
  else {
    check('Client reads known own booking', exactRow(await request(query('bookings', own), 'Client'), 'id', own));
    check('Client cannot read known other booking', denied(await request(query('bookings', other), 'Client'), true));
  }
  emit(`RESULT failed=${failed} unverified=${unverified}`);
  return failed ? 1 : unverified ? 2 : 0;
}

async function selftest() {
  let assertions = 0;
  const ok = (value) => { assert.ok(value); assertions++; };
  const rejects = (fn) => { assert.throws(fn); assertions++; };
  const token = (p) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(p)).toString('base64url')}.test`;
  const ref = 'abcdefghijklmnopqrst';
  const origin = `https://${ref}.supabase.co`;
  const fixtures = Object.fromEntries(Object.keys(RELATIONS).map((r) => [r, '11111111-1111-4111-8111-111111111111']));
  fixtures.clientOwnBooking = fixtures.bookings;
  fixtures.otherClientBooking = '22222222-2222-4222-8222-222222222222';
  const manifest = { approvedStaging: true, projectRef: ref, fixtures };
  const env = { STAGING_SUPABASE_URL: origin, STAGING_PUBLISHABLE_KEY: 'sb_publishable_test' };
  for (const [index, role] of ROLES.entries()) env[`STAGING_JWT_${role.toUpperCase()}`] = token({ role: 'authenticated', sub: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`, iss: `${origin}/auth/v1`, exp: Date.now() / 1000 + 3600 });
  const config = preflight(manifest, env);
  ok(config.origin === origin);
  rejects(() => preflight({ ...manifest, approvedStaging: false }, env));
  rejects(() => preflight({ ...manifest, projectRef: PRODUCTION }, env));
  for (const suffix of ['/rest/v1', '?x=1', '#x', '@evil.test']) rejects(() => preflight(manifest, { ...env, STAGING_SUPABASE_URL: origin + suffix }));
  rejects(() => preflight(manifest, { ...env, STAGING_PUBLISHABLE_KEY: token({ role: 'service_role', ref }) }));
  rejects(() => preflight(manifest, { ...env, STAGING_JWT_DRIVER: token({ role: 'authenticated', sub: fixtures.bookings, iss: `${origin}/auth/v1`, exp: 0 }) }));
  rejects(() => preflight(manifest, { ...env, STAGING_JWT_DRIVER: env.STAGING_JWT_OWNER }));
  for (const relation of Object.keys(RELATIONS)) rejects(() => preflight({ ...manifest, fixtures: { ...fixtures, [relation]: undefined } }, env));
  ok(!denied({ status: 200, data: [] }, false));
  ok(denied({ status: 200, data: [] }, true));
  ok(!denied({ status: 401, data: { code: 'PGRST301' } }, true));
  ok(!denied({ status: 404, data: [] }, true));
  // Empty, unprotected tables must be UNVERIFIED, never PASS. All fetches below are local stubs.
  let fakeCalls = 0;
  const logs = [];
  const fake = async (url, options) => {
    fakeCalls++;
    ok(options.method === 'GET' && options.redirect === 'error');
    const role = ROLES.find((r) => options.headers.Authorization === `Bearer ${config.tokens[r].token}`);
    const data = url.endsWith('/auth/v1/user') ? { id: config.tokens[role].subject } : url.endsWith('/auth_user_role') ? role : url.endsWith('/auth_can_view_money') ? MONEY.has(role) : [];
    return { status: 200, json: async () => data };
  };
  ok(await verify(config, fake, (line) => logs.push(line)) === 2);
  ok(logs.some((line) => line.startsWith('UNVERIFIED Owner positive control payments')));
  ok(!logs.some((line) => line.startsWith('PASS anon cannot')));
  ok(fakeCalls === ROLES.length * 3 + Object.keys(RELATIONS).length + 2);
  console.log(`PASS ${assertions} local assertions; zero real network requests`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--self-test') await selftest();
  else {
    try {
      const manifest = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8'));
      const config = preflight(manifest, process.env);
      process.exitCode = await verify(config);
    } catch {
      // Never print thrown fetch messages, response bodies, URLs, JWTs or API keys.
      console.log('BLOCKED: confirmed separate staging manifest, fixtures and nine valid sessions required; no acceptance certified');
      process.exitCode = 2;
    }
  }
}
