import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const entities = ['client', 'product', 'bundle', 'pricing_structure', 'seasonal_rule']

function indexSnapshot(rows, name) {
  if (!Array.isArray(rows)) throw new Error(`${name} must be a JSON array.`)

  const index = new Map()
  for (const [position, row] of rows.entries()) {
    if (!row || !entities.includes(row.entity) ||
        typeof row.externalId !== 'string' || !row.externalId.trim() ||
        row.externalId !== row.externalId.trim() ||
        !row.fields || typeof row.fields !== 'object' || Array.isArray(row.fields)) {
      throw new Error(`${name} row ${position + 1} needs an entity, a trimmed externalId, and a fields object.`)
    }

    const key = JSON.stringify([row.entity, row.externalId])
    const matches = index.get(key) ?? []
    matches.push(row)
    index.set(key, matches)
  }
  return index
}

export function compareCutoverSnapshots(sourceRows, stagingRows) {
  const source = indexSnapshot(sourceRows, 'Booqable snapshot')
  const staging = indexSnapshot(stagingRows, 'OS snapshot')
  const counts = Object.fromEntries(entities.map(entity => [
    entity, { new: 0, updated: 0, unchanged: 0, conflict: 0, osOnly: 0 },
  ]))
  const rows = []

  for (const key of new Set([...source.keys(), ...staging.keys()])) {
    const sourceMatches = source.get(key) ?? []
    const stagingMatches = staging.get(key) ?? []
    const [entity, externalId] = JSON.parse(key)
    let status
    let reason
    let changedFields

    if (sourceMatches.length > 1 || stagingMatches.length > 1) {
      status = 'conflict'
      reason = 'Duplicate external ID within an entity.'
    } else if (!sourceMatches.length) {
      status = 'osOnly'
    } else if (!stagingMatches.length) {
      status = 'new'
    } else {
      status = isDeepStrictEqual(sourceMatches[0].fields, stagingMatches[0].fields)
        ? 'unchanged'
        : 'updated'
      if (status === 'updated') {
        const sourceFields = sourceMatches[0].fields
        const stagingFields = stagingMatches[0].fields
        changedFields = [...new Set([...Object.keys(sourceFields), ...Object.keys(stagingFields)])]
          .filter(field => Object.hasOwn(sourceFields, field) !== Object.hasOwn(stagingFields, field) ||
            !isDeepStrictEqual(sourceFields[field], stagingFields[field]))
          .sort()
      }
    }

    counts[entity][status]++
    rows.push({ entity, externalId, status,
      ...(reason ? { reason } : {}), ...(changedFields ? { changedFields } : {}) })
  }

  return { counts, rows }
}

function readSnapshot(path, name) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    throw new Error(`Could not read ${name} as JSON.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 2) {
      throw new Error('Usage: node scripts/compare-cutover-snapshots.mjs <booqable.json> <os.json>')
    }
    const report = compareCutoverSnapshots(readSnapshot(args[0], 'Booqable snapshot'), readSnapshot(args[1], 'OS snapshot'))
    console.log(JSON.stringify(report, null, 2))
    if (report.rows.some(row => row.status === 'conflict')) process.exitCode = 2
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
