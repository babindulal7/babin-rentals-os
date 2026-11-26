import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import { verificationSourceHash } from './test-receipt.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { chromium } = require(process.env.CADRA_PLAYWRIGHT || 'C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const sharp = require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')
const phase = process.argv[2] || 'after'
const root = process.cwd()
const dataset = process.env.CADRA_DATASET || 'seeded'
if (!['empty', 'seeded'].includes(dataset)) throw new Error('CADRA_DATASET must be empty or seeded')
const output = path.join(root, 'artifacts/cadra', `${phase}-${dataset}`)
const before = path.join(root, 'artifacts/cadra/before-source')
fs.mkdirSync(output, { recursive: true })
const appSource = fs.readFileSync(path.join(before, 'src/App.tsx'), 'utf8')
const ast = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const mounts = [], redirects = []
const routeConstants = Object.fromEntries([...fs.readFileSync(path.join(before, 'src/lib/routeTargets.ts'), 'utf8').matchAll(/export const (\w+) = '([^']+)'/g)].map(match => [match[1], match[2]]))
function walk(node) {
  if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(ast) === 'Route') {
    const attr = node.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'path')
    const route = attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text
      : attr?.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression && ts.isIdentifier(attr.initializer.expression) ? routeConstants[attr.initializer.expression.text] : null
    if (route && route !== '*' && route.startsWith('/')) {
      (/<(?:Navigate|\w*Redirect)\b/.test(node.getText(ast)) ? redirects : mounts).push(route)
    }
  }
  ts.forEachChild(node, walk)
}
walk(ast)
const routeStates = ['/rentals?action=new', '/inventory?action=new', '/clients?action=new', '/inventory?tab=bundles', '/inventory?tab=stock-check', '/inventory?tab=maintenance', '/clients?tab=membership', '/finance?tab=reports', '/finance?tab=payments', '/finance?tab=documents', '/settings?tab=branches', '/settings?tab=people', '/settings?tab=system']
const routes = [...new Set([...mounts, ...routeStates])]
const sizes = [[1280,800], [1440,900], [1920,1080], [768,1024], [820,1180], [1024,768], [1194,834], [320,844], [360,800], [375,812], [390,844], [430,932]].filter(([width])=>!/(quick|diagnose)/.test(phase)||[320,768,1440].includes(width))
const sourceHash = phase === 'before' ? JSON.parse(fs.readFileSync('artifacts/cadra/baseline-source.json', 'utf8')).sha256 : verificationSourceHash(root)
const port = phase === 'before' ? 3046 : 3047
const origin = `http://127.0.0.1:${port}`
const results = [], errors = [], diagnostics = [], links = new Set()
const resultFile = path.join(output, 'results.json')
if (process.env.CADRA_RESUME !== 'false' && fs.existsSync(resultFile)) {
  let previous = {}
  try { previous = JSON.parse(fs.readFileSync(resultFile, 'utf8')) } catch { console.log('Incomplete prior receipt; geometry will be rechecked') }
  if (previous.sourceHash === sourceHash && previous.dataset === dataset) {
    for (const entry of previous.results || []) if (entry.status !== 'NOT VERIFIED') results.push(entry)
    console.log('CADRA resuming', results.length, 'existing scenarios')
  }
}
const record = value => {
  diagnostics.push({ at: new Date().toISOString(), ...value })
  if (diagnostics.length > 500) diagnostics.shift()
}
const save = complete => { fs.writeFileSync(resultFile+'.tmp', JSON.stringify({
  phase, dataset, environment: { VITE_DATA_SOURCE: 'mock', VITE_MOCK_SEEDED: dataset === 'seeded' ? 'true' : 'false', remoteRequests: 'blocked', source: phase === 'before' ? 'preserved committed sources' : 'feature worktree' },
  reviewKind: 'Automated geometry checks and screenshots; manual visual review recorded separately',
  sourceHash, complete, sourceChanged: complete ? (phase === 'before' ? false : sourceHash !== verificationSourceHash(root)) : null, results, errors, diagnostics,
}, null, 2)); fs.renameSync(resultFile+'.tmp',resultFile) }
process.env.VITE_DATA_SOURCE = 'mock'
process.env.VITE_MOCK_SEEDED = dataset === 'seeded' ? 'true' : 'false'
const baselinePlugin = {
  name: 'cadra-committed-baseline', enforce: 'pre',
  load(id) {
    const relative = path.relative(root, id.split('?')[0])
    if (relative.startsWith('..')) return
    const saved = path.join(before, relative)
    if (fs.existsSync(saved) && fs.statSync(saved).isFile()) return fs.readFileSync(saved, 'utf8')
  },
  transformIndexHtml(html) {
    const saved = path.join(before, 'index.html')
    return fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : html
  },
}
const server = await createServer({
  mode: 'mock', cacheDir: `artifacts/cadra/vite-before-${dataset}`,
  plugins: phase === 'before' ? [baselinePlugin] : [],
  server: { watch: null, hmr: false, host: '127.0.0.1', port, strictPort: true, open: false },
  optimizeDeps: { entries: ['index.html'] },
})
await server.listen()
console.log('CADRA server listening', origin)
server.middlewares.use((request, response, next) => {
  const start = Date.now()
  response.on('finish', () => {
    if (response.statusCode >= 400 || Date.now() - start > 15000) record({ type: 'response', url: request.url, status: response.statusCode, ms: Date.now() - start })
  })
  next()
})
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-crash-reporter', '--disable-breakpad', '--no-proxy-server'] })
const contexts = []
async function newContext(storageState) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', ...(storageState ? { storageState } : {}) })
  contexts.push(context)
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') || /^(data:|blob:|about:)/.test(route.request().url()) ? route.continue() : route.abort())
  await context.addInitScript(() => {
    localStorage.setItem('babin-onboarding-completed', 'true')
    localStorage.setItem('br-theme-mode', document.cookie.split('; ').includes('cadra_theme=dark') ? 'dark' : 'light')
  })
  return context
}
function observe(page) {
  const pending = new Set()
  page.on('request', request => pending.add(request.url()))
  page.on('requestfinished', request => pending.delete(request.url()))
  page.on('requestfailed', request => { pending.delete(request.url()); record({ type: 'requestfailed', url: request.url(), error: request.failure()?.errorText }) })
  page.on('pageerror', error => { errors.push({ url: page.url(), error: error.message }); console.log('CADRA page error', error.message.slice(0, 200)) })
  page.on('console', message => { if (message.type() === 'error') record({ type: 'console', url: page.url(), error: message.text().slice(0, 500) }) })
  return pending
}
async function ready(page, route, timeout = 60000) {
  // Let the History API transition mount its lazy fallback before testing data readiness.
  await page.waitForTimeout(150)
  await page.waitForFunction(() => {
    const root = document.querySelector('#root')
    return root && root.textContent.trim().length > 12 && !/^(Loading|Restoring session)/.test(root.textContent.trim())
  }, { route }, { timeout })
  if (!['/login', '/forgot-password', '/reset-password'].includes(route)) {
    await page.locator('#main-content').waitFor({ state: 'visible', timeout })
    await page.waitForFunction(() => {
      const main = document.querySelector('#main-content')
      return main && main.textContent.trim().length > 0 && !main.querySelector('[style*="skeletonShimmer"]') && !/^Loading[.\u2026]*$/.test(main.textContent.trim())
    }, undefined, { timeout })
  }
  await page.waitForTimeout(200)
  await page.evaluate(() => document.fonts.ready)
}
try {
  const context = await newContext()
  const login = await context.newPage()
  const pending = observe(login)
  login.setDefaultTimeout(120000)
  // DOMContentLoaded waits for the whole first module graph; commit lets us observe warm-up failures.
  await login.goto(origin + '/login', { waitUntil: 'commit', timeout: 120000 })
  console.log('CADRA login committed; waiting for the mock Owner control')
  try {
    await login.locator('.auth-mock-btn[title="Sign in as Owner"]').waitFor({ state: 'visible', timeout: 180000 })
  } catch (error) {
    record({ type: 'login-timeout', pending: [...pending], text: await login.locator('body').innerText().catch(() => '') })
    await login.screenshot({ path: path.join(output, 'login-timeout.png') })
    throw error
  }
  await login.locator('.auth-mock-btn[title="Sign in as Owner"]').click()
  await login.locator('#main-content').waitFor({ state: 'visible', timeout: 60000 })
  const ownerState = await context.storageState()
  console.log('CADRA mock Owner signed in', 'dataset=' + dataset, 'pid=' + process.pid)
  // Read identities from the same authorized corpus used by the app, including
  // records whose compact list rows do not expose an anchor until opened.
  const corpusLinks = await login.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const [bundles, cases] = await Promise.all([
      supabase.from('bundles').select('id').limit(1),
      supabase.from('cases_v').select('id').limit(1),
    ])
    return [
      ...(bundles.data ?? []).map(row => '/inventory/bundles/' + row.id),
      ...(cases.data ?? []).map(row => '/inventory/cases/' + row.id),
    ]
  })
  corpusLinks.forEach(link => links.add(link))
  for (const route of ['/rentals', '/inventory', '/clients', '/crew', '/inventory/cases', '/finance', '/inventory?tab=bundles']) {
    await login.goto(origin + route, { waitUntil: 'commit', timeout: 60000 })
    await ready(login, route)
    // A bundle preview carries its real detail link; case rows navigate to their existing record.
    if (route === '/inventory?tab=bundles') {
      const title = login.locator('#main-content tbody tr button').filter({ hasText: /\S/ }).first()
      if (await title.count()) { await title.click(); await login.waitForTimeout(200) }
    }
    if (route === '/inventory/cases' && !(await login.locator('#main-content a[href^="/inventory/cases/"]').count())) {
      const row = login.locator('#main-content tbody tr').first()
      if (await row.count()) { await row.click(); await login.waitForTimeout(200); if (login.url().includes('/inventory/cases/')) links.add(new URL(login.url()).pathname) }
    }
    fs.writeFileSync(path.join(output, 'discovery-' + route.replace(/[^a-z0-9]+/gi, '-') + '.json'), JSON.stringify({ url: login.url(), text: (await login.locator('body').innerText()).slice(0, 24000), links: await login.locator('a[href^="/"]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), label: node.textContent }))) }, null, 2))
    for (const href of await login.locator('a[href^="/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))) if (href) links.add(href)
  }
  const staticPaths=new Set([...mounts,...redirects].filter(route=>!route.includes(':')))
  const recordLinks=[...links].filter(href=>!staticPaths.has(href.split('?')[0]))
  const parameterValues = new Map()
  for (const route of mounts.filter(route => route.includes(':'))) {
    const names = [...route.matchAll(/:([^/]+)/g)].map(match => match[1])
    const expression = new RegExp('^' + route.replace(/:[^/]+/g, '([^/?]+)') + '(?:[?].*)?$')
    for (const href of recordLinks) {
      const match = href.match(expression)
      if (match) names.forEach((name, index) => { const key = route.split('/:')[0] + ':' + name; if (!parameterValues.has(key)) parameterValues.set(key, match[index + 1]) })
    }
  }
  const resolved = routes.map(route => {
    if (!route.includes(':')) return { route, url: route, identitySource: 'registered route' }
    const expression = new RegExp('^' + route.replace(/:[^/]+/g, '[^/?]+') + '(?:[?].*)?$')
    const href = recordLinks.find(link => expression.test(link))
    if (href) return { route, url: href, identitySource: 'existing mock link' }
    if (route === '/inventory/cases/:id') return { route, url: '/inventory/cases/QA-UNKNOWN-RECORD', identitySource: 'explicit missing-record probe; corpus contains no cases' }
    const names = [...route.matchAll(/:([^/]+)/g)].map(match => match[1])
    return names.every(name => parameterValues.has(route.split('/:')[0] + ':' + name))
      ? { route, url: route.replace(/:([^/]+)/g, (_, name) => parameterValues.get(route.split('/:')[0] + ':' + name)), identitySource: 'identity from an existing mock link' }
      : { route, url: null, identitySource: 'no existing record link' }
  })
  fs.writeFileSync(path.join(output, 'route-manifest.json'), JSON.stringify({ dataset, environment: { VITE_DATA_SOURCE: 'mock', VITE_MOCK_SEEDED: process.env.VITE_MOCK_SEEDED }, mounts, redirects, routes: resolved, links: [...links], parameterValues: Object.fromEntries(parameterValues) }, null, 2))
  const jobs = []
  for (const entry of resolved) for (const [width, height] of sizes) for (const theme of /(quick|diagnose)/.test(phase)?['dark']:['light', 'dark']) jobs.push({ ...entry, width, height, theme })
  const limit = Math.min(Number(process.env.CADRA_LIMIT || jobs.length), jobs.length)
  const startingIndex = Number(process.env.CADRA_START || 0)
  const completeIndices = new Set(results.map(result => result.index))
  const queue = jobs.map((job, number) => ({ job, number }))
    .filter(({ number }) => number >= startingIndex && number < limit && !completeIndices.has(number))
    .sort((left, right) => left.job.theme.localeCompare(right.job.theme) || left.number - right.number)
  if(phase.includes('diagnose')){
    const failed=new Set(JSON.parse(fs.readFileSync(path.join(root,'artifacts/cadra/after-quick-seeded/results.json'),'utf8')).results.filter(row=>row.status==='FAIL').map(row=>row.route+':'+row.width))
    for(let index=queue.length-1;index>=0;index--)if(!failed.has(queue[index].job.route+':'+queue[index].job.width))queue.splice(index,1)
  }
  let cursor = 0
  console.log('CADRA jobs', jobs.length, 'pending', queue.length, 'resolved routes', resolved.filter(route => route.url).length, '/', resolved.length)
  await context.close()
  async function worker() {
    const owner = await newContext(ownerState)
    const anonymous = await newContext()
    const ownerPage = await owner.newPage(), anonymousPage = await anonymous.newPage()
    ownerPage.setDefaultTimeout(30000); anonymousPage.setDefaultTimeout(30000)
    observe(ownerPage); observe(anonymousPage)
    while (cursor < queue.length) {
      const { number, job } = queue[cursor++]
      if (!job.url) { results.push({ ...job, index: number, status: 'NOT VERIFIED', reason: 'No existing mock record link for this parameter route' }); continue }
      const page = ['/login', '/forgot-password', '/reset-password'].includes(job.route) ? anonymousPage : ownerPage
      try {
        await page.setViewportSize({ width: job.width, height: job.height })
        await page.context().addCookies([{ name: 'cadra_theme', value: job.theme, url: origin }])
        const sameOrigin = page.url().startsWith(origin + '/')
        const sameTheme = sameOrigin && await page.evaluate(theme => document.documentElement.dataset.theme === theme, job.theme)
        const sameRoute=page.url()===origin+job.url
        if (!sameTheme) {
          await page.goto(origin + job.url, { waitUntil: 'commit', timeout: 45000 })
        } else if(!sameRoute) {
          // Public History API drives BrowserRouter without rebooting all providers for every screenshot.
          await page.evaluate(url => {
            history.pushState({ ...history.state, key: crypto.randomUUID() }, '', url)
            dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
          }, job.url)
        }
        // Responsive layout and font effects must settle after a resize too.
        // A route remaining mounted does not mean its grid has finished reflowing.
        await ready(page, job.route, 45000)
        const geometry = await page.evaluate(() => {
          const main = document.querySelector('#main-content')
          const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
          const navigation = [...document.querySelectorAll('nav[aria-label="Main"]')].map(node => ({ ...rect(node), position: getComputedStyle(node).position, links: node.querySelectorAll('a').length }))
          const clippedHeaderControls = [...document.querySelectorAll('.app-global-header button, .app-global-header a')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) }).map(node => ({ label: node.getAttribute('aria-label') || node.textContent, ...rect(node) }))
          const clippedMovementControls = [...document.querySelectorAll('.movement-card__actions button')].filter(node => {
            const panel = node.closest('.movement-panel'), r = node.getBoundingClientRect(), p = panel?.getBoundingClientRect()
            return p && r.width > 0 && (r.left < p.left - 1 || r.right > p.right + 1)
          }).map(node => {
            const card = node.closest('.movement-card'), panel = node.closest('.movement-panel')
            return { label: node.getAttribute('aria-label') || node.textContent, ...rect(node), panel: rect(panel), grid: getComputedStyle(card).gridTemplateColumns,
              cells: [...card.children].map(child => ({ class: child.className, area: getComputedStyle(child).gridArea, ...rect(child) })) }
          })
          const offenders=main&&main.scrollWidth>main.clientWidth+1?[...main.querySelectorAll('*')].filter(node=>{
            const r=node.getBoundingClientRect(),bounds=main.getBoundingClientRect()
            if(r.width<1||r.right<=bounds.right+1){
              if(node.scrollWidth<=node.clientWidth+1)return false
            }
            for(let ancestor=node.parentElement;ancestor&&ancestor!==main;ancestor=ancestor.parentElement){const a=ancestor.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowX)&&a.right<=bounds.right+1)return false}
            return true
          }).slice(0,16).map(node=>({tag:node.tagName,class:node.className,text:node.textContent.slice(0,80),minWidth:getComputedStyle(node).minWidth,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,...rect(node)})):[]
          return { overflow: document.documentElement.scrollWidth - innerWidth, mainOverflow: main ? main.scrollWidth - main.clientWidth : 0, offenders, headers: document.querySelectorAll('.app-global-header').length, primaryNavigations: navigation.length, navigation, bottomBars: document.querySelectorAll('.app-bottom-bar').length, docks: document.querySelectorAll('.app-desktop-dock').length, theme: document.documentElement.dataset.theme, dialogs: document.querySelectorAll('[role="dialog"]').length, clippedHeaderControls, clippedMovementControls, alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent), text: document.body.innerText.slice(0, 1000) }
        })
        const stem = String(number).padStart(4, '0') + '-' + job.width + 'x' + job.height + '-' + job.theme
        const shot = stem + '.webp'
        await sharp(await page.screenshot({type:'png'})).webp({lossless:true,effort:2}).toFile(path.join(output,shot))
        const oldPng=path.join(output,stem+'.png')
        if(fs.existsSync(oldPng))fs.unlinkSync(oldPng)
        const failure = geometry.overflow > 1 || geometry.mainOverflow > 1 || geometry.clippedHeaderControls.length > 0 || geometry.clippedMovementControls.length > 0 || geometry.theme !== job.theme
        results.push({ ...job, index: number, shot, geometry, status: failure ? 'FAIL' : 'REVIEWED' })
      } catch (error) {
        results.push({ ...job, index: number, status: 'NOT VERIFIED', reason: error.message })
      }
      if (cursor % 12 === 0 || cursor === queue.length) { save(false); console.log(phase, dataset, 'captured', results.length + '/' + limit, 'last', job.route, job.width, job.theme) }
    }
    await ownerPage.close(); await anonymousPage.close()
  }
  await worker() // One browser worker bounds memory while database/build gates run separately.
  save(true)
  console.log(JSON.stringify({ phase, dataset, scenarios: results.length, fail: results.filter(result => result.status === 'FAIL').length, unverified: results.filter(result => result.status === 'NOT VERIFIED').length, errors: errors.length }))
} catch (error) {
  record({ type: 'fatal', error: error.message })
  try { save(false) } catch (receiptError) { console.error('Could not save capture receipt:',receiptError.message) }
  console.error('CADRA capture failed:', error)
  process.exitCode = 1
} finally {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 3000))])
  await Promise.race([server.close(), new Promise(resolve => setTimeout(resolve, 3000))])
}
