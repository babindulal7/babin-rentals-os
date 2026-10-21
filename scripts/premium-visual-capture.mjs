// Local mock-only Chromium evidence. No production requests or data writes.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setMaxListeners } from 'node:events'
import { runInteractions } from './premium-browser-interactions.mjs'

const phase = process.argv[2] ?? 'before'
if (!['before', 'after', 'inspect', 'checks'].includes(phase)) throw new Error('Use before, after, inspect or checks')
const origin = 'http://127.0.0.1:3011'
const out = path.resolve('docs/verification/premium-design', phase)
fs.mkdirSync(out, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9237', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  `--user-data-dir=${path.join(os.tmpdir(), `babin-premium-${Date.now()}`)}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', fs.openSync(path.join(out,'chromium.log'),'w')] })
chrome.on('error', error => console.error(error))
let socket
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let target
  for (let i = 0; i < 180 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9237/json/list')).json()).find(t => t.type === 'page') } catch {}
    if (!target) await delay(250)
  }
  if (!target) throw new Error('Headless Chromium did not start')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  setMaxListeners(100, socket)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let id = 0
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id
    const timer = setTimeout(() => { socket.removeEventListener('message', handler); reject(new Error(`Timed out: ${method}`)) }, 30000)
    const handler = event => {
      const msg = JSON.parse(event.data)
      if (msg.id !== current) return
      clearTimeout(timer); socket.removeEventListener('message', handler)
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result)
    }
    socket.addEventListener('message', handler)
    socket.send(JSON.stringify({ id: current, method, params }))
  })
  const evaluate = async expression => {
    const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result?.value
  }
  await command('Page.enable')
  // Hard navigation between test cases discards only this isolated browser's drafts.
  socket.addEventListener('message', event => {
    if (JSON.parse(event.data).method === 'Page.javascriptDialogOpening') void command('Page.handleJavaScriptDialog',{accept:true})
  })
  await command('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false })
  await command('Network.enable')
  // Only the isolated Vite origin and inline/local resources may load.
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    if (msg.method !== 'Fetch.requestPaused') return
    const { requestId, request } = msg.params
    const allowed = request.url.startsWith(origin) || /^(data:|blob:|about:)/.test(request.url)
    void command(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' })
  })
  await command('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('babin-onboarding-completed','true');localStorage.setItem('br-theme-mode','light');" })
  const navigate = async route => {
    await command('Page.navigate', { url: origin + route })
    for (let i = 0; i < 100; i++) {
      if (await evaluate("document.readyState === 'complete' && !!document.querySelector('header,.auth-mock-btn')")) break
      await delay(200)
    }
    await evaluate('document.fonts.ready.then(() => true)')
    await delay(1500)
    for (let i = 0; i < 80; i++) {
      const loading = await evaluate("/Loading (equipment form|record|saved|rentals|clients|inventory)|Loading[….]{1,3}/i.test(document.body.innerText)")
      if (!loading) break
      await delay(200)
    }
  }
  await navigate('/login')
  if (!await evaluate("!!document.querySelector('.auth-mock-btn')")) {
    console.log(await evaluate('document.body.innerText.slice(0,1200)'))
    throw new Error('Mock sign-in missing: refusing non-mock verification')
  }
  await evaluate("document.querySelector('.auth-mock-btn').click()")
  await delay(1500)
  await navigate('/rentals')
  await delay(1500)
  const booking = await evaluate("(() => {const n=document.querySelector('tbody')?.innerText.match(/#(\\d+)/)?.[1];return n ? '/rentals/'+n : null})()")
  await navigate('/inventory')
  await delay(1500)
  const asset = await evaluate("(() => {const n=document.querySelector('tbody')?.innerText.match(/EQ\\d+/)?.[0];return n ? '/inventory/'+n : null})()")
  console.log(JSON.stringify({ booking, asset }))
  const routes = [ ['today','/today'], ['rentals','/rentals'], ['new-rental','/rentals?action=new'],
    ['booking', booking], ['inventory','/inventory'], ['add-equipment','/inventory?tab=new'],
    ['edit-equipment', asset ? `${asset}?action=edit` : null], ['clients','/clients'],
    ['finance','/finance'], ['operations','/operations'], ['reports','/reports/pulse'], ['calendar','/calendar'] ]
  const configs = [375,768,820,1024,1280,1440,1920].map(width=>({ width, theme:'light', zoom:1 }))
  configs.push({width:820,theme:'dark',zoom:1},{width:1440,theme:'dark',zoom:1},
    {width:820,theme:'light',zoom:1.25},{width:1440,theme:'dark',zoom:1.25},
    {width:1440,theme:'high-contrast',zoom:1,contrast:true},{width:375,theme:'light',zoom:1,reduce:true})
  const selected = process.argv[3]?.split(',')
  const results = selected && fs.existsSync(path.join(out,'measurements.json')) ? JSON.parse(fs.readFileSync(path.join(out,'measurements.json'),'utf8')).filter(r=>!selected.includes(r.screen)) : []
  for (const [screen, route] of routes) {
    if (phase === 'checks') continue
    if (selected && !selected.includes(screen)) continue
    if (!route) { results.push({screen, error:'No actual mock record link found'}); continue }
    await navigate(route)
    for (const config of phase === 'inspect' ? configs.filter(c=>[375,1440].includes(c.width) && c.zoom===1 && !c.reduce && !c.contrast) : configs) {
      const { width, theme, zoom } = config
      await command('Emulation.setDeviceMetricsOverride', { width: Math.floor(width/zoom), height: Math.floor(1000/zoom), deviceScaleFactor: zoom, mobile:false })
      await command('Emulation.setEmulatedMedia', { features: [ {name:'prefers-reduced-motion',value:config.reduce?'reduce':'no-preference'}, {name:'prefers-contrast',value:config.contrast?'more':'no-preference'} ] })
      await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.removeAttribute('data-style')`)
      await delay(250)
      const measurement = await evaluate(`(() => {
        const rect = el => { if(!el) return null; const r=el.getBoundingClientRect();const s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,gap:s.gap,border:s.borderWidth,radius:s.borderRadius,shadow:s.boxShadow,font:s.fontSize,background:s.backgroundColor} }
        const header=document.querySelector('.app-global-header,header');
        const controls=header ? [...header.querySelectorAll('button,a,input')].filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),...rect(e)})) : [];
        return {url:location.pathname+location.search,title:document.querySelector('h1')?.textContent,header:rect(header),main:rect(document.querySelector('main')),page:rect(document.querySelector('.page-shell,.module-page-shell')),overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),controls,cards:[...document.querySelectorAll('.surface-card,.movement-panel,.movement-card')].slice(0,6).map(rect),rows:[...document.querySelectorAll('tbody tr')].slice(0,3).map(rect),equipmentSections:document.querySelectorAll('.record-section-link').length,errors:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent.trim()).filter(Boolean)}
      })()`)
      const name = `${screen}-${width}-${theme}-${zoom===1.25?'125':'100'}${config.reduce?'-reduced':''}`
      const shot = await command('Page.captureScreenshot', {format:'png'})
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.data,'base64'))
      results.push({screen,route,config,screenshot:`docs/verification/premium-design/${phase}/${name}.png`,...measurement})
    }
    fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(results,null,2))
    console.log(`${screen}: ${results.filter(r=>r.screen===screen).length} captures`)
  }
  if (phase === 'checks') await runInteractions({command,evaluate,navigate,out,asset})
} finally { socket?.close(); chrome.kill() }
