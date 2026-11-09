// Local mock-only screen checks. Blocks all requests outside the isolated Vite origin.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { setMaxListeners } from 'node:events'

const origin = 'http://127.0.0.1:3021'
const out = path.resolve('artifacts/conflict-resolution/browser')
fs.mkdirSync(out, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9241', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${path.join(os.tmpdir(), `babin-language-review-${Date.now()}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const results = []
try {
  let target
  for (let i = 0; i < 80 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9241/json/list')).json()).find(t => t.type === 'page') } catch {}
    if (!target) await delay(250)
  }
  if (!target) throw new Error('Local headless Chromium unavailable')
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
      clearTimeout(timer)
      socket.removeEventListener('message', handler)
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result)
    }
    socket.addEventListener('message', handler)
    socket.send(JSON.stringify({ id: current, method, params }))
  })
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result?.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return
      await delay(300)
    }
    throw new Error(`Screen did not become ready: ${expression}; ${await evaluate('document.body.innerText.slice(0, 1800)')}`)
  }
  await command('Page.enable')
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    if (msg.method !== 'Fetch.requestPaused') return
    const { requestId, request } = msg.params
    const allowed = request.url.startsWith(`${origin}/`) || /^(data:|blob:|about:)/.test(request.url)
    void command(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' })
  })
  await command('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('babin-onboarding-completed','true');localStorage.setItem('br.settings.language','नेपाली');" })
  for (const role of ['Owner', 'Warehouse']) {
    await command('Page.navigate', { url: `${origin}/login` })
    await waitFor("!!document.querySelector('.auth-mock-btn')")
    await evaluate(`Array.from(document.querySelectorAll('.auth-mock-btn')).find(button => button.innerText.includes(${JSON.stringify(role)})).click()`)
    await waitFor("location.pathname !== '/login'")
    for (const width of [375, 820, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 })
      await command('Page.navigate', { url: `${origin}/settings?tab=system` })
      await waitFor("!!document.querySelector('#my-language')?.getClientRects().length && document.fonts.status === 'loaded'")
      const state = await evaluate(`(() => {
        const select = document.querySelector('#my-language');
        return { lang: document.documentElement.lang, value: select.value, disabled: select.disabled,
          options: Array.from(select.options).map(o => o.value), height: select.getBoundingClientRect().height,
          explanation: document.querySelector('#my-language-help').innerText,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          title: document.querySelector('h1')?.innerText, route: location.pathname };
      })()`)
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(path.join(out, `${role.toLowerCase()}-${width}.png`), Buffer.from(image.data, 'base64'))
      console.log(JSON.stringify({ role, width, ...state }))
      assert.equal(state.lang, 'en', 'Legacy device language must not activate Nepali')
      assert.equal(state.value, 'en')
      assert.equal(state.disabled, true)
      assert.deepEqual(state.options, ['en'])
      assert.ok(state.explanation.includes('all staff screens'))
      assert.ok(state.height >= 44)
      assert.equal(state.overflow, false)
      assert.equal(state.route, '/settings')
      results.push({ role, width, ...state })
      if (role === 'Owner') {
        await waitFor("!!document.querySelector('[aria-label=\"Edit glossary term New Rental\"]')")
        await evaluate("document.querySelector('[aria-label=\"Edit glossary term New Rental\"]').click()")
        await waitFor("!!document.querySelector('#glossary-wording')?.getClientRects().length")
        const wording = await evaluate(`(() => {
          const input = document.querySelector('#glossary-wording');
          const value = input.value + ' काम';
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
          input.dispatchEvent(new Event('input',{bubbles:true})); return value;
        })()`)
        await waitFor("Array.from(document.querySelectorAll('button')).some(button => button.innerText === 'Approve and apply' && !button.disabled)")
        const modalImage = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        fs.writeFileSync(path.join(out, `owner-edit-${width}.png`), Buffer.from(modalImage.data, 'base64'))
        await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.innerText === 'Approve and apply').click()")
        await waitFor("document.body.innerText.includes('Approved and applied: New Rental')")
        assert.equal(await evaluate("document.documentElement.lang"), 'en')
        assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(wording)})`))
        results.push({ role, width, glossaryApproval: 'passed', applicationLanguage: 'en' })
      } else {
        assert.equal(await evaluate("!!document.querySelector('#glossary-heading')"), false)
      }
    }
    // This isolated browser contains only mock records. Sign out through the mock API.
    await evaluate("import('/src/lib/supabase.ts').then(module => module.supabase.auth.signOut())")
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`PASS: ${results.length} role/viewport screen checks; evidence in ${out}`)
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close()
  chrome.kill()
}
