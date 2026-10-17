const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const { chromium } = require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('artifacts/header-release-2026-10-16')
const root = path.resolve('tmp/header-finish-preview')
async function main() {
  fs.mkdirSync(output, { recursive: true })
  if(!process.argv.includes('--reuse-build')) await esbuild.build({entryPoints:{app:'src/main.tsx'},outdir:root,bundle:true,format:'esm',jsx:'automatic',sourcemap:false,define:{'import.meta.env':JSON.stringify({DEV:true,PROD:false,MODE:'mock',BASE_URL:'/',VITE_DATA_SOURCE:'mock',VITE_MOCK_SEEDED:'true'}),'process.env.NODE_ENV':'"development"'},loader:{'.woff':'file','.woff2':'file','.png':'file','.svg':'file','.jpg':'file','.wasm':'file'}})
  fs.writeFileSync(path.join(root,'index.html'), '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
  console.log('Bundled current source')
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')
    let file=path.resolve(root,name)
    if(path.relative(root,file).startsWith('..')) { res.writeHead(403);res.end();return }
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory()) {
      const asset=path.resolve('public',name)
      file=!path.relative(path.resolve('public'),asset).startsWith('..')&&fs.existsSync(asset)&&fs.statSync(asset).isFile()?asset:path.join(root,'index.html')
    }
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]
    res.writeHead(200,{'Content-Type':type||'application/octet-stream'});fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base=`http://127.0.0.1:${server.address().port}`
  const browser=await chromium.launch({headless:true,channel:'msedge'})
  const page=await browser.newPage({viewport:{width:1440,height:960},serviceWorkers:'block'})
  const results=[], errors=[]
  page.on('pageerror', e=>errors.push(e.message))
  page.setDefaultTimeout(120000)
  page.setDefaultNavigationTimeout(120000)
  try {
    await page.goto(base+'/finance',{waitUntil:'domcontentloaded'})
    await page.locator('#login-email, .app-global-header').first().waitFor()
    if(await page.locator('#login-email').count()) {
      await page.locator('#login-email').fill('owner@babinrentals.com')
      await page.locator('#login-password').fill('local-header-check')
      await page.locator('button[type=submit]').click()
      await page.locator('.app-global-header').waitFor()
    }
    for(const width of [375,820,1440]) for(const theme of ['light','dark','high-contrast']) for(const route of ['/finance','/finance?tab=expenses','/finance?tab=documents','/operations','/settings','/settings?tab=business','/settings?tab=branches']) {
      await page.setViewportSize({width,height:960})
      await page.goto(base+route,{waitUntil:'domcontentloaded'})
      await page.locator('.app-global-header').waitFor()
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
      await page.waitForTimeout(200)
      const metrics=await page.locator('.app-global-header').evaluate(el=>{
        const r=el.getBoundingClientRect()
        const controls=[...el.querySelectorAll('button,a,input')].filter(c=>c.getBoundingClientRect().width>0&&getComputedStyle(c).visibility!=='hidden').map(c=>{const b=c.getBoundingClientRect();return {name:c.getAttribute('aria-label')||c.textContent.trim(),x:b.x,right:b.right,width:b.width,height:b.height}})
        const title=el.querySelector('.app-global-header__breadcrumbs')?.getBoundingClientRect()
        const current=el.querySelector('[aria-current="page"]')
        return {height:r.height,width:r.width,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,titleWidth:title?.width,titleClipped:current?current.scrollWidth>current.clientWidth:false,controls}
      })
      const item={width,theme,route,metrics}
      results.push(item)
      assert.equal(await page.locator('.app-global-header').count(),1,'Single shared header')
      assert(Math.abs(metrics.height-64)<1,`Header height: ${route}/${width}`)
      assert(metrics.titleWidth>30,`Title squeezed: ${route}/${width}`)
      if(width===375&&route.startsWith('/settings?')) assert(!metrics.titleClipped,`Settings section title clipped: ${route}`)
      assert(metrics.controls.every(c=>c.x>=-1&&c.right<=width+1),`Header control clipped: ${route}/${width}`)
      assert(metrics.controls.every(c=>c.height>=43&&c.width>=43),`Small header control: ${route}/${width}`)
      const more=page.locator('.app-global-header button[aria-label="More actions"]')
      if(width<1280&&await more.count()) {
        await more.click()
        const menu=page.getByRole('menu').last()
        await menu.waitFor()
        item.menu=await menu.getByRole('menuitem').allTextContents()
        if(route.startsWith('/operations')) assert(item.menu.some(t=>t.includes('Delivery & Logistics')),'Operations logistics reachable')
        if(route==='/settings') assert(item.menu.some(t=>t.includes('View audit log')),'Settings audit reachable')
        if(route.includes('tab=expenses')||route.includes('tab=documents')) {
          await menu.getByRole('menuitem',{name:/^Filters/}).click()
          await page.getByRole('dialog').last().waitFor()
          item.filtersOpened=true
          await page.keyboard.press('Escape')
        } else await page.keyboard.press('Escape')
      }
      if(width===375&&theme==='light') await page.screenshot({path:path.join(output,route.replace(/[^a-z0-9]/gi,'-')+'.png'),fullPage:false})
      if(results.length%7===0) console.log(`Checked ${results.length}/63 screen/theme cases`)
    }
    for(const width of [375,820]) {
      await page.setViewportSize({width,height:960})
      await page.goto(base+'/settings?tab=business',{waitUntil:'domcontentloaded'})
      await page.getByRole('button',{name:'Edit settings',exact:true}).click()
      await page.locator('.app-global-header').getByRole('button',{name:'Done',exact:true}).waitFor()
      await page.locator('.app-global-header button[aria-label="More actions"]').click()
      await page.getByRole('menuitem',{name:'Discard changes',exact:true}).click()
      await page.getByRole('button',{name:'Edit settings',exact:true}).waitFor()
      if(width===375) {
        await page.locator('.app-global-header').getByRole('button',{name:'Back to settings',exact:true}).click()
        await page.getByRole('button',{name:'Edit settings',exact:true}).waitFor({state:'detached'})
      }
    }
    assert.equal(errors.length,0,'No browser errors')
    console.log(`PASS ${results.length} responsive screen/theme cases`)
  } finally {
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({environment:'isolated current-source mock bundle',results,errors},null,2))
    await browser.close();await new Promise(resolve=>server.close(resolve))
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})
