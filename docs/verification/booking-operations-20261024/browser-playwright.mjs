import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { verificationSourceHash } from '../../../scripts/test-receipt.mjs'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const phase = process.argv[2] ?? 'inspect'
const out = path.resolve('docs/verification/booking-operations-20261024', phase)
fs.mkdirSync(out, { recursive: true })
const sourceHash=verificationSourceHash(process.cwd())
process.env.VITE_DATA_SOURCE = 'mock'
const snapshots = path.resolve('docs/verification/booking-operations-20261024/before-source')
const preview = await createServer({ mode:'mock', plugins: phase === 'before' ? [{name:'saved-before-sources',enforce:'pre',load(id){const relative=path.relative(process.cwd(),id.split('?')[0]);const saved=path.join(snapshots,relative);if(relative.startsWith('src')&&fs.existsSync(saved)&&fs.statSync(saved).isFile())return fs.readFileSync(saved,'utf8')}}] : [], cacheDir:`artifacts/booking-operations-20261024/browser-vite-${phase}`, server:{host:'127.0.0.1',port:3031,strictPort:true,open:false} })
await preview.listen()
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-crash-reporter','--disable-breakpad','--no-proxy-server'] })
try {
  const context = await browser.newContext({ viewport: {width:1440,height:900}, reducedMotion:'reduce' })
  await context.route('**/*',route=> /^http:\/\/127\.0\.0\.1:3031\//.test(route.request().url()) || /^(data:|blob:|about:)/.test(route.request().url()) ? route.continue() : route.abort())
  await context.addInitScript(()=>{localStorage.setItem('babin-onboarding-completed','true');localStorage.setItem('br-theme-mode','light')})
  const page=await context.newPage()
  page.setDefaultTimeout(25000)
  console.log('node preview', (await fetch('http://127.0.0.1:3031/login',{signal:AbortSignal.timeout(10000)})).status)
  page.on('requestfailed',r=>console.log('request failed',r.url().slice(0,150),r.failure()))
  await page.goto('http://127.0.0.1:3031/login',{waitUntil:'domcontentloaded',timeout:45000})
  await page.locator('.auth-mock-btn[title="Sign in as Owner"]').click()
  await page.goto('http://127.0.0.1:3031/operations')
  await page.waitForTimeout(1800)
  if(phase==='inspect') {
    fs.writeFileSync(path.join(out,'page.txt'),await page.locator('body').innerText())
    console.log(await page.locator('body').innerText())
    console.log(await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),text:n.textContent}))))
  } else {
    const returnAction=page.getByRole('button',{name:'Return',exact:true}).first()
    const rentalHref=await returnAction.locator('xpath=ancestor::tr').locator('a[href^="/rentals/"]').first().getAttribute('href')
    if(!rentalHref)throw Error('No real mock Return booking in queue')
    const results=[]
    for(const [width,height] of (phase==='checks' ? [[320,844],[430,844],[720,450],[512,384]] : [[1440,900],[1024,768],[768,1024],[390,844]])) {
      for(const theme of ['light','dark']) {
        await page.setViewportSize({width,height})
        await page.emulateMedia({forcedColors:phase==='checks'&&width===430?'active':'none',reducedMotion:'reduce'})
        await page.goto('http://127.0.0.1:3031'+rentalHref,{waitUntil:'domcontentloaded'})
        await page.evaluate(theme=>{localStorage.setItem('br-theme-mode',theme);document.documentElement.dataset.theme=theme},theme)
        await page.waitForTimeout(1200)
        if(!(await page.getByRole('button',{name:'Operations',exact:true}).count())) await page.getByRole('button',{name:'More actions',exact:true}).click()
        if(!(await page.getByRole('button',{name:'Operations',exact:true}).count())) {fs.writeFileSync(path.join(out,'missing-trigger.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(out,'missing-trigger.png')});throw Error('Operations trigger missing on '+page.url())}
        await page.getByRole('button',{name:'Operations',exact:true}).click()
        await page.waitForTimeout(250)
        await page.screenshot({path:path.join(out,`menu-${width}-${theme}.png`)})
        const menuItem=page.getByRole('menuitem',{name:'Return & Inspection',exact:true})
        if(await menuItem.count()) await menuItem.click()
        else await page.getByRole('button',{name:'Return & Inspection',exact:true}).click()
        await page.locator('nav[aria-label="Operation stage"]').waitFor()
        await page.waitForTimeout(1000)
        await page.evaluate(()=>document.fonts.ready)
        const measurement=await page.locator('[role="dialog"]').first().evaluate(dialog=>{
          const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}}
          return {title:dialog.querySelector('h2')?.textContent, viewport:{width:innerWidth,height:innerHeight},pageOverflow:document.documentElement.scrollWidth-innerWidth,dialog:rect(dialog),stages:[...dialog.querySelectorAll('nav[aria-label="Operation stage"] button')].map(b=>({label:b.getAttribute('aria-label'),disabled:b.disabled,...rect(b)})),footers:dialog.querySelectorAll('.operations-shell__footer').length,confirm:[...dialog.querySelectorAll('button')].filter(b=>/^(Confirm|Saving)/.test(b.textContent.trim())).map(b=>({label:b.textContent,...rect(b)})),alerts:[...dialog.querySelectorAll('[role="alert"]')].map(e=>e.textContent)}
        })
        const shot=`operations-${width}-${theme}.png`
        await page.screenshot({path:path.join(out,shot)})
        results.push({width,height,theme,shot,sourceHash,zoom:width===720||width===512?'200% equivalent CSS viewport; native browser zoom untested':'100%',forcedColors:phase==='checks'&&width===430,source:phase==='before'?'saved pre-edit local source rendered in real Chromium':'current working source',...measurement})
        fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(results,null,2))
        console.log(shot, 'overflow',measurement.pageOverflow,'footer',measurement.footers)
        await page.keyboard.press('Tab')
        const focusInside=await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))
        if(!focusInside)throw Error('Keyboard focus escaped operations dialog')
        if(phase!=='before' && (measurement.pageOverflow>0 || measurement.footers!==1 || measurement.stages.some(stage=>stage.width<44||stage.height<44) || measurement.confirm.some(button=>button.bottom>height||button.height<56)))throw Error('Operations geometry check failed')
      }
    }
    if(phase!=='before') {
      const checks=[]
      await page.getByRole('button',{name:'Scan an item to mark it received',exact:true}).click()
      await page.waitForTimeout(300)
      if(await page.locator('[role="dialog"]').count()!==2)throw Error('Nested scanner did not open above Operations')
      await page.keyboard.press('Tab'); await page.keyboard.press('1')
      if(!(await page.locator('button[aria-current="step"]').getAttribute('aria-label')).startsWith('Return'))throw Error('Nested scanner consumed outer stage shortcut')
      await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      if(await page.locator('[role="dialog"]').count()!==1)throw Error('Escape closed the wrong nested layer')
      checks.push('Nested scanner opens above Operations; number shortcut ignored; Escape closes scanner only')
      await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      const focused=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))
      if(focused!=='Operations')throw Error('Operations did not restore focus to its opener: '+focused)
      checks.push('Operations Escape restores focus to its trigger')
      await page.setViewportSize({width:1440,height:900})
      await page.goto('http://127.0.0.1:3031/operations',{waitUntil:'domcontentloaded'})
      await page.getByRole('button',{name:'Return',exact:true}).first().click()
      await page.locator('.operations-shell__panel').waitFor()
      await page.screenshot({path:path.join(out,'dock-1440.png')})
      if(await page.locator('.operations-shell__panel .operations-shell__footer').count()!==1)throw Error('Dock footer ownership failed')
      checks.push('Desktop queue dock retains its table and one footer')
      await page.locator('.operations-shell__panel').getByRole('button',{name:'Mark Returned',exact:true}).first().click()
      const progress=await page.locator('.operations-shell__panel').evaluate(node=>node.innerText.match(/Return Progress\s*([^\n]+)/)?.[1])
      await page.setViewportSize({width:768,height:1024}); await page.waitForTimeout(400)
      const retained=await page.locator('.operations-shell__panel').evaluate(node=>node.innerText.match(/Return Progress\s*([^\n]+)/)?.[1])
      if(progress!==retained || await page.locator('[data-dock-focused="true"]').count()!==1)throw Error('Dirty dock lost its manual triage on breakpoint change')
      await page.screenshot({path:path.join(out,'dirty-dock-768.png')})
      await page.getByRole('button',{name:'Close panel (Esc)',exact:true}).click()
      await page.getByRole('button',{name:'Keep Editing',exact:true}).click()
      if(await page.locator('.operations-shell__panel').count()!==1)throw Error('Cancel discard lost the dock')
      await page.getByRole('button',{name:'Close panel (Esc)',exact:true}).click()
      await page.getByRole('button',{name:'Discard Changes',exact:true}).click()
      checks.push('Manual local triage survives desktop-to-tablet resize and cancelled discard; explicit discard closes it; no Return committed')
      fs.writeFileSync(path.join(out,'interactions.json'),JSON.stringify({sourceHash,sourceChanged:sourceHash!==verificationSourceHash(process.cwd()),checks,environment:'existing local mock corpus; no floor confirmation or scan performed; remote requests blocked'},null,2))
    }
  }
} catch(error) {
  console.error(error)
  process.exitCode=1
} finally {
  const timeout=()=>new Promise(resolve=>setTimeout(resolve,3000))
  await Promise.race([browser.close(),timeout()])
  await Promise.race([preview.close(),timeout()])
}
