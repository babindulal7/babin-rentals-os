const { chromium } = require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')

async function run() {
  const log = fs.openSync(path.join(__dirname, 'mock-server.log'), 'w')
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'artifacts/import-release-2026-10-16/mock-dist', '--host', '127.0.0.1', '--port', '3047', '--strictPort'], { cwd: path.resolve(__dirname, '../..'), windowsHide: true, stdio: ['ignore', log, log] })
  let browser
  const errors = []
  try {
    let ready = false
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch('http://127.0.0.1:3047')).ok) { ready = true; break } } catch {}
      if (server.exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    assert.ok(ready, 'Isolated preview server must start')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:3047/login')
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await page.getByRole('button', { name: 'Owner', exact: true }).click()
    await page.goto('http://127.0.0.1:3047/clients?tab=import')
    const csv = 'name,phone\nImport recovery one,9899999123\nImport recovery two,9799999124'
    await page.locator('input[type=file]').setInputFiles({ name: 'recovery.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: 'Import 2 Clients', exact: true }).waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'Resume client import' }).waitFor()
    await page.getByRole('button', { name: 'Resume import', exact: true }).click()
    const widths = []
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const measured = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, clipped: [...document.querySelectorAll('.client-import-preview td')].filter(cell => cell.scrollWidth > cell.clientWidth + 1).length }))
      assert.ok(measured.content <= width + 1, `Page overflow ${JSON.stringify(measured)}`)
      assert.equal(measured.clipped, 0, 'Preview cells must fit without horizontal scrolling')
      widths.push(measured)
      await page.screenshot({ path: path.join(__dirname, `preview-${width}.png`), fullPage: true })
    }
    const commit = page.getByRole('button', { name: 'Import 2 Clients', exact: true })
    await commit.click()
    await page.getByText('2 of 2 clients confirmed saved.', { exact: false }).waitFor()
    const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('babin.clientImportRecovery.v1')).draft.batch.map(row => row.clientUuid))
    await page.reload()
    await page.getByRole('button', { name: 'Resume import', exact: true }).click()
    await page.getByRole('button', { name: 'Check saved rows & continue', exact: true }).click()
    await page.getByRole('button', { name: 'Import complete', exact: true }).waitFor()
    const replayKeys = await page.evaluate(() => JSON.parse(localStorage.getItem('babin.clientImportRecovery.v1')).draft.batch.map(row => row.clientUuid))
    assert.deepEqual(replayKeys, keys)
    assert.equal(await page.locator('a[href^="/clients/"]').count(), 2)
    await page.screenshot({ path: path.join(__dirname, 'saved-after-replay.png'), fullPage: true })
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(__dirname, 'browser-result.json'), JSON.stringify({ environment: 'isolated compiled mock; not remote staging', draftRestoredAfterReload: true, savedBatchReplayedWithOriginalKeys: true, widths, pageErrors: errors }, null, 2))
  } finally { if (browser) await browser.close(); server.kill(); fs.closeSync(log) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
