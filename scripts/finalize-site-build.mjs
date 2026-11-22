#!/usr/bin/env node
/**
 * Finish an isolated Vite build for one Cloudflare Pages project.
 * This script never calls Cloudflare and never deploys anything.
 */
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const site = process.argv[2]
if (site !== 'staff' && site !== 'client') {
  console.error('Usage: node scripts/finalize-site-build.mjs staff|client')
  process.exit(1)
}
const out = resolve(site === 'staff' ? 'dist-staff' : 'dist-client')

// Development-only sample pages must not be published on either hostname.
await Promise.all(['elements.html', 'preview.html'].map((name) =>
  rm(join(out, name), { force: true }),
))

if (site === 'staff') {
  const index = await readFile(join(out, 'index.html'), 'utf8')
  if (!index.includes('id="root"')) throw new Error('Staff build is missing the operations entry document.')
  await writeFile(join(out, '_redirects'), '/* /index.html 200\n')
} else {
  const marketing = await readFile(join(out, 'marketing.html'), 'utf8')
  const booking = await readFile(join(out, 'booking.html'), 'utf8')
  if (!marketing.includes('id="marketing-root"') || !booking.includes('id="booking-root"')) {
    throw new Error('Client build is missing a public-only entry document.')
  }

  // Vite preserves source HTML file names. Make marketing the site root without
  // bundling src/main.tsx or the private operations router.
  await copyFile(join(out, 'marketing.html'), join(out, 'index.html'))

  // The client site MUST NOT inherit the staff PWA/service worker or test pages.
  await Promise.all(['push-worker.js', 'sw.js', 'registerSW.js', 'manifest.webmanifest'].map((name) =>
    rm(join(out, name), { force: true }),
  ))
  await writeFile(
    join(out, '_redirects'),
    ['/booking /booking.html 200', '/booking/* /booking.html 200',
      '/book /booking.html 200', '/catalogue /booking.html 200', ''].join('\n'),
  )
  // Presence of 404.html prevents Cloudflare Pages from treating unknown URLs
  // (/today, /finance, /settings) as a single-page app route.
  await writeFile(
    join(out, '404.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | Babin Rentals</title><body style="font:16px system-ui;background:#0b1220;color:#f8fafc;padding:3rem"><h1>Page not found</h1><p>This address is not available on the client website.</p><a style="color:#f59e0b" href="/">Back to Babin Rentals</a></body></html>\n',
  )
}

// No indexed staging pages before an explicit launch review.
await writeFile(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
console.log(`[${site}] Prepared isolated static output: ${out}`)
