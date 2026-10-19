import fs from 'node:fs';
let p=fs.readFileSync('audit-security-probe.mjs','utf8');
p=p.replace('grant usage on schema storage to authenticated;', 'grant usage on schema storage,auth to authenticated;');
p=p.replace('const booking=(await db.query',`console.log('FORGED_AUDIT_PERSISTED',(await db.query("select actor_id,actor_role from audit_events where reason='Forged owner audit event'")).rows);\nconst booking=(await db.query`);
fs.writeFileSync('audit-security-probe.mjs',p);
