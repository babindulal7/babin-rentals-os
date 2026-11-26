import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {createServer} from 'vite'
import {verificationSourceHash} from '../../../scripts/test-receipt.mjs'
const require=createRequire(import.meta.url)
const {chromium}=require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const sharp=require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')
const output=path.resolve('artifacts/cadra/interactions');fs.mkdirSync(output,{recursive:true})
const sourceHash=verificationSourceHash(process.cwd()),checks=[],errors=[]
let page
async function bounded(promise,label,ms=60000){
 let timer
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),ms)})])}
 finally{clearTimeout(timer)}
}
function selectedContrast(foreground,background){
 const rgb=value=>{const values=value.match(/[\d.]+/g)?.map(Number);assert.ok(values&&values.length>=3,`Expected computed RGB colour: ${value}`);assert.equal(values[3]??1,1,'Selected navigation needs its opaque paired surface');return values.slice(0,3)}
 const luminance=value=>rgb(value).map(channel=>channel/255).map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4).reduce((sum,channel,index)=>sum+channel*[0.2126,0.7152,0.0722][index],0)
 const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
 assert.ok(ratio>=4.5,`Selected navigation contrast ${ratio.toFixed(2)} must reach 4.5`);return ratio
}
process.env.VITE_DATA_SOURCE='mock';process.env.VITE_MOCK_SEEDED='true'
const origin='http://127.0.0.1:3048'
const server=await createServer({mode:'mock',cacheDir:'artifacts/cadra/vite-before-seeded',server:{watch:null,hmr:false,host:'127.0.0.1',port:3048,strictPort:true,open:false}})
await server.listen()
console.log('QA local server listening',origin)
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-proxy-server','--disable-crash-reporter','--disable-breakpad']})
console.log('QA browser launched')
const save=()=>fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({sourceHash,sourceChanged:sourceHash!==verificationSourceHash(process.cwd()),checks,errors,environment:'Isolated seeded mock; nonlocal network blocked; no hosted or custody writes'},null,2))
try{
 const context=await bounded(browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'}),'Browser context')
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')||/^(data:|blob:|about:)/.test(route.request().url())?route.continue():route.abort())
 await context.addInitScript(()=>{localStorage.setItem('babin-onboarding-completed','true');const mode=document.cookie.split('; ').find(value=>value.startsWith('cadra_theme='))?.slice('cadra_theme='.length);localStorage.setItem('br-theme-mode',['light','dark','high-contrast','glass','glass-light','system'].includes(mode)?mode:'light')})
 page=await bounded(context.newPage(),'Browser page');page.setDefaultTimeout(45000)
 console.log('QA page ready')
 page.on('pageerror',error=>errors.push({url:page.url(),error:error.message}))
 await page.goto(origin+'/login',{waitUntil:'commit',timeout:120000})
 console.log('QA login committed')
 await page.locator('.auth-mock-btn[title="Sign in as Owner"]').click({timeout:180000})
 await page.locator('#main-content').waitFor()
 console.log('QA mock Owner ready')
 const shot=async(name)=>sharp(await page.screenshot()).webp({lossless:true,effort:2}).toFile(path.join(output,name+'.webp'))
 const check=(name,details={})=>{checks.push({name,...details});save();console.log('PASS',name)}
 await page.goto(origin+'/operations',{waitUntil:'domcontentloaded',timeout:90000})
 const returnAction=page.getByRole('button',{name:'Return',exact:true}).first()
 await returnAction.waitFor()
 const rentalHref=await returnAction.locator('xpath=ancestor::tr').locator('a[href^="/rentals/"]').first().getAttribute('href')
 assert.ok(rentalHref,'A real Return booking must exist in the mock corpus')
 for(const [width,height]of[[1440,900],[820,1180],[375,812],[320,844]])for(const theme of['light','dark']){
  await page.setViewportSize({width,height});await context.addCookies([{name:'cadra_theme',value:theme,url:origin}])
  await page.goto(origin+rentalHref,{waitUntil:'domcontentloaded'});await page.locator('#main-content').waitFor()
  await page.getByRole('button',{name:'Operations',exact:true}).waitFor()
  await page.getByRole('button',{name:'Operations',exact:true}).click()
  const item=width<768?page.getByRole('button',{name:'Return & Inspection',exact:true}):page.getByRole('menuitem',{name:'Return & Inspection',exact:true})
  await item.click()
  await page.locator('nav[aria-label="Operation stage"]').waitFor();await page.waitForTimeout(350)
  const geometry=await page.locator('[role="dialog"]').first().evaluate(dialog=>{
   const box=node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom,left:r.left,right:r.right}}
   return {overflow:document.documentElement.scrollWidth-innerWidth,footers:dialog.querySelectorAll('.operations-shell__footer').length,stages:[...dialog.querySelectorAll('nav[aria-label="Operation stage"] button')].map(box),confirm:[...dialog.querySelectorAll('button')].filter(node=>/^(Confirm|Saving)/.test(node.textContent.trim())).map(box)}
  })
  assert.equal(geometry.overflow,0);assert.equal(geometry.footers,1)
  assert.equal(geometry.stages.length,4);assert.equal(geometry.confirm.length,1)
  assert.ok(geometry.stages.every(stage=>stage.width>=44&&stage.height>=44))
  assert.ok(geometry.confirm.every(button=>button.height>=56&&button.bottom<=height))
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')))
  await shot(`operations-${width}-${theme}`);check(`Operations modal, footer and focus at ${width}px ${theme}`,geometry)
  await page.keyboard.press('Escape');await page.locator('nav[aria-label="Operation stage"]').waitFor({state:'detached'})
 }
 await page.setViewportSize({width:375,height:812});await page.goto(origin+'/today',{waitUntil:'domcontentloaded'})
 await page.locator('.app-bottom-bar').waitFor()
 await page.locator('.dashboard-mobile-nav').getByText('Returns',{exact:true}).click()
 const movementBoard=page.locator('.rental-dashboard__panels')
 await movementBoard.getByRole('button',{name:/^Return & Inspect/}).first().waitFor()
 assert.equal(await movementBoard.getByRole('button',{name:/^Handover/}).count(),0)
 assert.ok(await movementBoard.getByRole('button',{name:/^Return & Inspect/}).evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=56})))
 await shot('today-phone-returns')
 await page.locator('.dashboard-mobile-nav').getByText('Pickups',{exact:true}).click()
 await movementBoard.getByRole('button',{name:/^Handover/}).first().waitFor()
 check('Phone Today switches between Returns and Pickups with visible contained 56px Return controls')
 assert.equal(await page.locator('.app-bottom-bar').count(),1);assert.equal(await page.locator('.app-desktop-dock').count(),0)
 await page.getByRole('button',{name:'More',exact:true}).click();await page.locator('[role="dialog"]').waitFor()
 const moreStyle=await page.getByRole('button',{name:'More',exact:true}).evaluate(button=>{const style=getComputedStyle(button);return {color:style.color,background:style.backgroundColor}})
 selectedContrast(moreStyle.color,moreStyle.background)
 await page.keyboard.press('Escape');await page.locator('[role="dialog"]').waitFor({state:'detached'})
 await page.getByRole('button',{name:'Scan equipment',exact:true}).click();await page.locator('[role="dialog"]').waitFor()
 await page.keyboard.press('Escape');await page.locator('[role="dialog"]').waitFor({state:'detached'});check('Phone has one bottom bar; More and scanner open and dismiss')
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/today?shellPreview=classic',{waitUntil:'domcontentloaded'})
 await page.locator('nav[aria-label="Main"]').waitFor()
 assert.equal(await page.locator('.app-desktop-dock').count(),0);await shot('classic-desktop')
 await page.goto(origin+'/today',{waitUntil:'domcontentloaded'});await page.locator('.app-desktop-dock').waitFor();assert.equal(await page.locator('.app-desktop-dock').count(),1);await shot('cadra-desktop')
 check('Classic comparison and Cadra default share the existing route')
 for(const [width,height]of[[1440,900],[375,812]])for(const mode of['high-contrast','glass','glass-light','system']){
  const expectedTheme=mode==='glass'?'dark':mode==='glass-light'?'light':mode==='system'?'dark':mode
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'})
  await page.setViewportSize({width,height});await context.addCookies([{name:'cadra_theme',value:mode,url:origin}])
  await page.goto(origin+'/today',{waitUntil:'domcontentloaded'});await page.locator('#main-content').waitFor()
  await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected,expectedTheme)
  await page.waitForFunction(()=>{const counts=[...document.querySelectorAll('.dispatch-summary__count')];return counts.length===2&&counts.every(node=>/^\d+$/.test(node.textContent.trim()))})
  await page.locator('.movement-card__cta-btn').first().waitFor()
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(350)
  const geometry=await page.evaluate(()=>{const main=document.querySelector('#main-content'),selected=getComputedStyle(document.querySelector('nav[aria-label="Main"] [aria-current="page"]'));return {theme:document.documentElement.dataset.theme,style:document.documentElement.dataset.style||null,overflow:document.documentElement.scrollWidth-innerWidth,mainOverflow:main.scrollWidth-main.clientWidth,headers:document.querySelectorAll('.app-global-header').length,navigation:document.querySelectorAll('nav[aria-label="Main"]').length,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,selectedForeground:selected.color,selectedBackground:selected.backgroundColor}})
  assert.equal(geometry.theme,expectedTheme);assert.equal(geometry.style,mode.startsWith('glass')?'glass':null)
  assert.ok(geometry.overflow<=1&&geometry.mainOverflow<=1);assert.equal(geometry.headers,1);assert.equal(geometry.navigation,1);assert.equal(geometry.reducedMotion,true)
  geometry.selectedContrast=selectedContrast(geometry.selectedForeground,geometry.selectedBackground)
  await shot(`today-${width}-${mode}`);check(`Today theme ${mode} at ${width}px`,geometry)
 }
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'})
 await page.goto(origin+'/today',{waitUntil:'domcontentloaded'});await page.locator('.app-desktop-dock__link[aria-current="page"]').waitFor()
 await page.waitForFunction(()=>{const counts=[...document.querySelectorAll('.dispatch-summary__count')];return counts.length===2&&counts.every(node=>/^\d+$/.test(node.textContent.trim()))})
 await page.locator('.movement-card__cta-btn').first().waitFor()
 const accessibilityStyles=await page.evaluate(()=>{
  const active=document.querySelector('.app-desktop-dock__link[aria-current="page"]'),activeStyle=getComputedStyle(active)
  const probe=document.createElement('div');probe.style.cssText='animation:pulse 2s infinite;transition:opacity 2s';document.body.append(probe)
  const computed=getComputedStyle(probe),result={forcedColors:matchMedia('(forced-colors: active)').matches,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,outlineStyle:activeStyle.outlineStyle,outlineWidth:activeStyle.outlineWidth,animationName:computed.animationName,transitionDuration:computed.transitionDuration};probe.remove();return result
 })
 assert.equal(accessibilityStyles.forcedColors,true);assert.equal(accessibilityStyles.reducedMotion,true)
 assert.equal(accessibilityStyles.outlineStyle,'solid');assert.equal(accessibilityStyles.outlineWidth,'2px');assert.equal(accessibilityStyles.animationName,'none');assert.equal(accessibilityStyles.transitionDuration,'0s')
 await shot('today-forced-colors');check('Forced-colors active navigation outline and computed reduced-motion suppression',accessibilityStyles)
 await page.emulateMedia({forcedColors:'none',colorScheme:'light',reducedMotion:'reduce'});await context.addCookies([{name:'cadra_theme',value:'light',url:origin}])
 // Use the existing record discovered by the route matrix, never a fabricated unit.
 const manifest=JSON.parse(fs.readFileSync('artifacts/cadra/after-seeded/route-manifest.json','utf8'))
 const assetHref=manifest.routes.find(row=>row.route==='/inventory/:assetId')?.url
 assert.ok(assetHref,'An existing product identity is required')
 await page.setViewportSize({width:375,height:812});await page.goto(origin+assetHref,{waitUntil:'domcontentloaded'})
 const openUnit=()=>page.locator('.inventory-model-card').getByRole('button',{name:'Edit',exact:true}).first().click()
 const closeUnit=()=>page.locator('strong').filter({hasText:/^Editing unit /}).locator('..').getByRole('button',{name:'Close',exact:true}).click()
 await openUnit();const shelf=page.getByRole('textbox',{name:'Shelf',exact:true});await shelf.waitFor()
 const originalShelf=await shelf.inputValue()
 assert.equal(await page.locator('#edit-state').count(),0,'Custody status must remain read-only')
 await shelf.fill('QA-SHELF')
 await page.setViewportSize({width:820,height:1180});await page.locator('.inventory-table').waitFor();assert.equal(await shelf.inputValue(),'QA-SHELF')
 await page.setViewportSize({width:320,height:844});await page.locator('.inventory-model-card').first().waitFor();assert.equal(await shelf.inputValue(),'QA-SHELF')
 assert.ok(await page.evaluate(()=>{const main=document.querySelector('#main-content');return document.documentElement.scrollWidth<=innerWidth+1&&main.scrollWidth<=main.clientWidth+1}))
 await shot('unit-editor-320-draft')
 await page.setViewportSize({width:375,height:812});await page.locator('.inventory-model-card').first().waitFor();assert.equal(await shelf.inputValue(),'QA-SHELF')
 await shelf.locator('..').getByRole('button',{name:'Save',exact:true}).click()
 await page.getByText('Unit changes saved to inventory.',{exact:true}).waitFor()
 await closeUnit();await openUnit();assert.equal(await shelf.inputValue(),'QA-SHELF')
 await shot('unit-editor-phone')
 await shelf.fill(originalShelf);await shelf.locator('..').getByRole('button',{name:'Save',exact:true}).click()
 await page.getByText('Unit changes saved to inventory.',{exact:true}).waitFor();await closeUnit()
 check('Unit shelf draft survives phone/tablet reflow and save reads back on reopening in local mock; original value restored')
 await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/calendar?view=timeline',{waitUntil:'domcontentloaded'})
 await page.getByRole('tab',{name:'Timeline',exact:true}).waitFor()
 assert.equal(await page.getByRole('tab',{name:'Timeline',exact:true}).getAttribute('aria-selected'),'true')
 await page.getByText('Warehouse bay allocations have no authoritative scheduling contract.',{exact:true}).waitFor()
 await page.getByRole('combobox',{name:'Row type',exact:true}).click()
 await page.getByRole('option',{name:'Warehouse Bays',exact:true}).click()
 await page.getByText('No recorded resources match this view',{exact:true}).waitFor()
 await shot('calendar-unsupported-resource-desktop')
 await page.setViewportSize({width:375,height:812})
 await page.locator('[aria-label="Resource agenda"]').waitFor()
 await page.getByText('No recorded resource allocations match this view.',{exact:true}).waitFor()
 check('Calendar Timeline names unavailable warehouse-bay source and preserves an honest empty phone agenda')
 const pdf=await page.evaluate(async()=>{
  const {createScheduleAmendment}=await import('/src/lib/scheduleAmendment.ts')
  const canvas=document.createElement('canvas');canvas.width=850;canvas.height=240
  const c=canvas.getContext('2d');c.strokeStyle='#111';c.lineWidth=4;c.beginPath();c.moveTo(80,160);c.bezierCurveTo(240,20,180,220,370,110);c.bezierCurveTo(450,30,500,190,700,90);c.stroke()
  const input={proposalId:'00000000-0000-4000-8000-000000000001',bookingId:'QA-ONLY-RENTAL',originalDocumentNo:'QA-ONLY-AGR-1',originalHash:'a'.repeat(64),pickupAt:'2027-01-02T00:15:00Z',returnAt:'2027-01-04T00:15:00Z',signerName:'परीक्षण हस्ताक्षर',signerRole:'Client representative',signedAt:'2026-10-26T10:00:00Z',signatureDataUrl:canvas.toDataURL('image/png')}
  const blob=await createScheduleAmendment(input)
  let longDetailsRefused=false
  try{await createScheduleAmendment({...input,signerName:'W'.repeat(200)})}catch(error){longDetailsRefused=/exceed/.test(error.message)}
  return {bytes:[...new Uint8Array(await blob.arrayBuffer())],longDetailsRefused}
 })
 assert.ok(pdf.longDetailsRefused);fs.writeFileSync(path.join(output,'sample-schedule-amendment.pdf'),Buffer.from(pdf.bytes))
 check('Generated PDF with drawn mark and Nepali signer; overlong details fail before upload (raster inspection recorded separately)')
 assert.equal(errors.length,0,'No uncaught browser errors');save()
}catch(error){
 errors.push({fatal:error.stack})
 if(page){
  try{fs.writeFileSync(path.join(output,'failure-page.txt'),await page.locator('body').innerText({timeout:5000}));await sharp(await page.screenshot({timeout:5000})).webp({lossless:true,effort:2}).toFile(path.join(output,'failure-page.webp'))}catch(captureError){errors.push({capture:captureError.message})}
 }
 save();console.error(error);process.exitCode=1
}
finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,3000))])}
