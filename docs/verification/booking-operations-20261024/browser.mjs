// Local mock-only Chromium evidence. No production requests or data writes.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { setMaxListeners } from 'node:events'


const phase = process.argv[2] ?? 'before'
if (!['before', 'after', 'inspect', 'checks'].includes(phase)) throw new Error('Use before, after, inspect or checks')
const origin = 'http://127.0.0.1:3021'
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), phase)
fs.mkdirSync(out, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--remote-debugging-port=9271', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  `--user-data-dir=${path.join(os.tmpdir(), `babin-premium-${Date.now()}`)}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', fs.openSync(path.join(out,'chromium.log'),'w')] })
chrome.on('error', error => console.error(error))
let socket
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let target
  for (let i = 0; i < 180 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9271/json/list')).json()).find(t => t.type === 'page') } catch {}
    if (!target) await delay(250)
  }
  if (!target) throw new Error('Headless Chromium did not start')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  setMaxListeners(100, socket)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let id = 0
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id
    const timer = setTimeout(() => { socket.removeEventListener('message', handler); reject(new Error(`Timed out: ${method}`)) }, 60000)
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
    await command('Page.navigate', {url:origin+route})
    await delay(3000)
    if(await evaluate("!!document.querySelector('.auth-mock-btn')")) {await evaluate("document.querySelector('.auth-mock-btn').click()");await delay(2500)}
    await evaluate('document.fonts.ready.then(()=>true)')
  }
  await navigate('/operations')
  console.log(JSON.stringify(await evaluate("({text:document.body.innerText.slice(0,14000),buttons:[...document.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),text:b.textContent,disabled:b.disabled})),links:[...document.querySelectorAll('a[href]')].slice(-30).map(a=>({text:a.textContent,href:a.getAttribute('href')}))})"),null,2))
} finally {socket?.close();chrome.kill()}
