import * as fs from 'fs';
import * as path from 'path';

const files = [
  '0262_online_booking_away_mode.sql',
  '0263_product_families.sql',
  '0264_public_product_family_options.sql',
  '0265_submit_request_rates_in_paisa.sql',
  '0266_manager_approvals_to_owner.sql',
  '0267_database_enforced_aal2_money_roles.sql',
  '0268_sign_in_events_and_new_device.sql'
];

let bundle = '-- ==========================================================================\n'
           + '-- BUNDLED MIGRATIONS 0262 - 0268 FOR SUPABASE STAGING REHEARSAL\n'
           + '-- ==========================================================================\n\n';

for (const f of files) {
  bundle += '-- --------------------------------------------------------------------------\n';
  bundle += `-- FILE: ${f}\n`;
  bundle += '-- --------------------------------------------------------------------------\n';
  let c = fs.readFileSync(path.join('supabase/migrations', f), 'utf8').trim();
  const ver = f.slice(0, 4);
  const name = f.slice(5, -4);
  if (!c.includes('insert into supabase_migrations.schema_migrations')) {
    const rec = `\ninsert into supabase_migrations.schema_migrations (version, name) values ('${ver}', '${name}') on conflict (version) do nothing;\n`;
    if (c.toLowerCase().includes('commit;')) {
      const idx = c.toLowerCase().lastIndexOf('commit;');
      c = c.slice(0, idx) + rec + c.slice(idx);
    } else {
      c = c + rec;
    }
  }
  bundle += c + '\n\n';
}

fs.writeFileSync('docs/verification/STAGING_MIGRATIONS_0262_TO_0268_BUNDLE.sql', bundle, 'utf8');
console.log('Bundle written successfully. Size:', bundle.length, 'bytes');
