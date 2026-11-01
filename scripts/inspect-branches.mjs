import { execSync } from 'child_process'

const branches = [
  'lane-a/T1-15-switch-user-with-name-plus-pin',
  'lane-a/T8-02-plans-admin-screen',
  'lane-a/T8-06-crew-overtime-half-or-full-day',
  'lane-a/T8-06-crew-overtime-ui',
  'lane-a/T8-07-timesheet-by-the-day',
  'lane-a/T8-09-staff-renting-gear-finish',
  'lane-b/T4-01-delivery-dispatch-on-the-database',
  'lane-b/T4-04-team-notes',
  'lane-b/T4-04-team-notes-repair',
  'lane-b/T4-06-export-old-browser-only-entries',
  'lane-b/T4-07-delivery-zones',
  'lane-b/T4-08-one-time-rider-link',
  'lane-c/T3-01-re-book',
  'lane-c/T3-14a-invoice-write-hardening',
  'lane-c/T3-smart-reservations',
]

for (const b of branches) {
  try {
    const log = execSync(`git log main..${b} --oneline`, { encoding: 'utf8' }).trim()
    const count = log ? log.split('\n').length : 0
    if (count > 0) {
      console.log(`=== ${b} (${count} commits ahead) ===`)
      console.log(log.split('\n').slice(0, 4).join('\n'))
      const diffFiles = execSync(`git diff --name-only main...${b}`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter((f) => f.includes('supabase/migrations/'))
      if (diffFiles.length) console.log('  Migrations:', diffFiles.join(', '))
    } else {
      console.log(`=== ${b} (ALREADY IN MAIN) ===`)
    }
  } catch (e) {
    console.log(`=== ${b} (ERROR: ${e.message.split('\n')[0]}) ===`)
  }
}
