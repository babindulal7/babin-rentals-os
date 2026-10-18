import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const MIG = join(ROOT, 'supabase', 'migrations')
const PRELUDE = join(ROOT, 'supabase', 'pglite-prelude.sql')

/**
 * Creates an in-process PGlite database loaded with pgcrypto, btree_gist,
 * the prelude script, and all database migrations in sequential order.
 *
 * @param {Object} [options]
 * @param {string[]} [options.excludeMigrations] - prefixes of migrations to skip
 * @returns {Promise<PGlite>} initialized PGlite instance
 */
export async function createTestDatabase(options = {}) {
  const { excludeMigrations = [] } = options
  const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
  await db.exec(readFileSync(PRELUDE, 'utf8'))
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (excludeMigrations.some((prefix) => f.startsWith(prefix))) continue
    await db.exec(readFileSync(join(MIG, f), 'utf8'))
  }
  return db
}
