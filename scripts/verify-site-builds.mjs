#!/usr/bin/env node
/** Static artifact acceptance checks, not a substitute for browser/RLS testing. */
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const target = process.argv[2]
if (target && target !== 'staff' && target !== 'client') {
  console.error('Usage: node scripts/verify-site-builds.mjs [staff|client]')
  process.exit(1)
}
const sites = target ? [target] : ['staff', 'client']
const read = (path) => readFile(path, 'utf8')
const exists = async (path) => { try { await access(path); return true } catch { return false } }

for (const site of sites) {
  const out = resolve(site === 'staff' ? 'dist-staff' : 'dist-client')
  const html = await read(join(out, 'index.html'))
  const redirects = await read(join(out, '_redirects'))
  const robots = await read(join(out, 'robots.txt'))
  const manifest = JSON.parse(await read(join(out, '.vite', 'manifest.json')))
  const entries = Object.entries(manifest)
    .filter(([, item]) => item.isEntry)
    .map(([name]) => name)
  assert.match(robots, /Disallow: \/$/, 'Unapproved sites must not be indexed')
  for (const name of ['elements.html', 'preview.html']) {
    assert.equal(await exists(join(out, name)), false, `Unexpected public sample page: ${name}`)
  }

  if (site === 'staff') {
    assert.match(html, /id="root"/)
    assert(!html.includes('id="marketing-root"'))
    assert(!html.includes('id="booking-root"'))
    assert(entries.some((x) => x.endsWith('index.html')), 'Staff entry absent from Vite manifest')
    assert(!entries.some((x) => x.endsWith('marketing.html') || x.endsWith('booking.html')))
    assert.equal(await exists(join(out, 'marketing.html')), false)
    assert.equal(await exists(join(out, 'booking.html')), false)
    assert.match(redirects, /^\/\* \/index\.html 200/m)
  } else {
    assert.match(html, /id="marketing-root"/)
    assert(!html.includes('id="root"'))
    assert.match(await read(join(out, 'booking.html')), /id="booking-root"/)
    assert(entries.some((x) => x.endsWith('marketing.html')))
    assert(entries.some((x) => x.endsWith('booking.html')))
    assert(!entries.some((x) => x.endsWith('index.html') || x.endsWith('src/main.tsx')))
    assert.match(redirects, /^\/booking \/booking\.html 200/m)
    assert(!redirects.includes('/* /index.html'), 'Client must not have staff SPA fallback')
    assert.equal(await exists(join(out, '404.html')), true)
    for (const name of ['push-worker.js', 'sw.js', 'registerSW.js', 'manifest.webmanifest']) {
      assert.equal(await exists(join(out, name)), false, `Staff worker leaked into client: ${name}`)
    }
  }
  console.log(`[${site}] static artifact checks PASS (${entries.length} entrypoints)`)
}
