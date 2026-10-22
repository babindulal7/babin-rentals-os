import fs from 'node:fs'
import path from 'node:path'

/** Drive actual controls through Chromium input, against the labelled mock corpus. */
export async function runInteractions({command,evaluate,navigate,out,asset}) {
  const results=[]
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
  const check=(name,pass,details)=>{results.push({name,pass:Boolean(pass),details});fs.writeFileSync(path.join(out,'interactions.json'),JSON.stringify({complete:false,results},null,2));console.log(`${pass?'PASS':'FAIL'} ${name}`)}
  const resize=width=>command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
  const click=async expression=>{
    const r=await evaluate(`(() => {const e=${expression};if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    if(!r) return false
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r})
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r})
    await delay(300)
    return true
  }
  const press=async key=>{
    await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Tab'?9:27})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='Tab'?9:27})
    await delay(100)
  }
  const shot=async name=>{const r=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`${name}.png`),Buffer.from(r.data,'base64'))}
  const findButton=text=>`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`
  for(const width of [375,820,1440]) {
    await resize(width)
    await navigate('/inventory?tab=new')
    const primary="document.querySelector('[data-header-slot=primary] button')"
    check(`Add equipment ${width}: one hosted Create`,await evaluate("document.querySelectorAll('[aria-label=\"Create equipment\"]').length===1 && !document.querySelector('.record-actions') && !!document.querySelector('[data-header-slot=primary] button')"))
    check(`Add equipment ${width}: seven anchors`,await evaluate("document.querySelectorAll('.record-section-link').length===7"))
    await click("document.querySelector('[aria-label=\"More record actions\"]')")
    check(`Add equipment ${width}: Cancel and alternate create in More`,await evaluate("[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('Cancel')) && [...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('Create & add another'))"))
    await press('Escape')
    check(`Add equipment ${width}: Escape restores focus`,await evaluate("document.activeElement?.getAttribute('aria-label')==='More record actions'"))
    await click("document.querySelector('[data-header-slot=information] button')")
    check(`Add equipment ${width}: on-demand summary opens`,await evaluate("document.querySelector('[data-header-slot=information] button')?.getAttribute('aria-expanded')==='true' && [...document.querySelectorAll('aside')].some(e=>e.getAttribute('aria-label')==='Record summary' && e.getBoundingClientRect().width>0)"))
    await shot(`add-equipment-${width}-summary`)
    // Phone drawers are modal and trap focus; dismiss with their close control.
    await click("document.querySelector('button[aria-label=\"Close record summary\"]')")
    check(`Add equipment ${width}: drawer closes`,await evaluate("document.querySelector('[data-header-slot=information] button')?.getAttribute('aria-expanded')==='false'"))
    await click(primary)
    check(`Add equipment ${width}: invalid Create shows inline errors`,await evaluate("!!document.querySelector('.record-error-summary') && location.search.includes('tab=new')"))
    await shot(`add-equipment-${width}-validation`)
    await click(findButton('Add unit'))
    const sizes=await evaluate("[...document.querySelectorAll('.equipment-cell-input,.equipment-cell-select,.equipment-icon-button')].filter(e=>e.getClientRects().length).map(e=>({label:e.id||e.getAttribute('aria-label'),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}))")
    check(`Add equipment ${width}: unit controls at least 44px`,sizes.length>0 && sizes.every(s=>s.height>=44),sizes)
    check(`Add equipment ${width}: status is read-only with words`,await evaluate("!!document.querySelector('.equipment-badge-status') && !document.querySelector('td:nth-child(5) input,td:nth-child(5) select')"))
  }
  if(asset) {
    await resize(1440)
    await navigate(asset+'?action=edit')
    const edit=await evaluate("({name:document.querySelector('#record-name')?.value,saveDisabled:document.querySelector('[data-header-slot=primary] button')?.disabled,sections:document.querySelectorAll('.record-section-link').length,units:document.querySelectorAll('.equipment-unit-table tbody tr').length,unitMutationButtons:[...document.querySelectorAll('button')].filter(b=>/^(Add unit|Remove unit|Paste Serials)$/.test(b.textContent.trim())).length})")
    check('Edit equipment: prefilled, clean Save disabled, no stock mutation controls',Boolean(edit.name)&&edit.saveDisabled&&edit.sections===7&&edit.unitMutationButtons===0,edit)
    await shot('edit-equipment-prefilled')
  }
  for(const width of [375,820,1440]) {
    await resize(width)
    await navigate('/finance')
    const geometry=await evaluate("({paymentButtons:document.querySelectorAll('header [aria-label=\"Record Payment\"]').length,headerHeight:document.querySelector('.app-global-header')?.getBoundingClientRect().height,offscreen:[...document.querySelectorAll('.app-global-header button')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth}).map(e=>e.getAttribute('aria-label'))})")
    check(`Finance ${width}: single payment action and no clipped header`,geometry.paymentButtons===1&&geometry.headerHeight===64&&geometry.offscreen.length===0,geometry)
    await click("document.querySelector('header [aria-label=\"Record Payment\"]')")
    check(`Finance ${width}: Payment opens its real modal`,await evaluate("[...document.querySelectorAll('[role=dialog]')].some(e=>e.getBoundingClientRect().width>0 && /Record Payment/i.test(e.innerText))"))
    await shot(`finance-${width}-payment-modal`)
    await press('Escape')
  }
  await resize(820)
  await navigate('/inventory?q=Aputure')
  const beforeUrl=await evaluate('location.pathname+location.search')
  await click("document.querySelector('[data-header-slot=filters] button')")
  check('Inventory: filter drawer opens without changing search URL',await evaluate(`location.pathname+location.search===${JSON.stringify(beforeUrl)} && document.querySelector('[data-header-slot=filters] button')?.getAttribute('aria-expanded')==='true'`))
  await shot('inventory-820-filters')
  await press('Escape')
  for(let i=0;i<8;i++) await press('Tab')
  check('Keyboard: focus reaches a visible control',await evaluate("document.activeElement!==document.body && document.activeElement.getBoundingClientRect().height>=44"),await evaluate("({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent.trim(),outline:getComputedStyle(document.activeElement).outlineStyle})"))
  await navigate('/inventory?tab=new')
  for(const theme of ['light','dark','high-contrast']) {
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`)
    await delay(250)
    const colors=await evaluate("({foreground:getComputedStyle(document.querySelector('.equipment-tracking-option.is-active strong')).color,background:getComputedStyle(document.querySelector('.equipment-tracking-option.is-active')).backgroundColor})")
    const channels=value=>{const n=value.match(/[\d.]+/g).map(Number);return value.startsWith('color(')?n.slice(0,3):n.slice(0,3).map(v=>v/255)}
    const lum=value=>channels(value).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
    const values=[lum(colors.foreground),lum(colors.background)].sort((a,b)=>b-a)
    const ratio=(values[0]+.05)/(values[1]+.05)
    check(`Tracking selector ${theme}: measured text contrast`,ratio>=4.5,{...colors,ratio})
  }
  // Actual shared Card component, mounted only in a temporary labelled test fixture.
  const variants=await evaluate(`(async()=>{
    const entry=await (await fetch('/src/main.tsx')).text();
    const imports=[...entry.matchAll(/from\\s+["']([^"']+)["']/g)].map(match=>match[1]);
    const reactUrl=imports.find(url=>url.includes('/react.js?'));
    const domUrl=imports.find(url=>url.includes('/react-dom_client.js?'));
    if(!reactUrl||!domUrl)throw new Error('Cannot resolve the running Vite React dependency URLs');
    const React=(await import(reactUrl)).default;
    const ReactDOM=await import(domUrl);
    const createRoot=ReactDOM.createRoot??ReactDOM.default.createRoot;
    const {Card}=await import('/src/components/ui/Card.tsx');
    const host=document.createElement('div');host.setAttribute('aria-label','Temporary card verification fixture');document.querySelector('main').append(host);
    const root=createRoot(host);root.render(React.createElement(React.Fragment,null,...[
      ['default',{}],['bordered',{className:'surface-card--bordered'}],['interactive',{'data-interactive':'true',tabIndex:0}],['status',{statusColor:'var(--danger-text)'}],['disabled',{'aria-disabled':true}]
    ].map(([name,props])=>React.createElement(Card,{...props,key:name,'data-variant':name,title:name},'Test surface'))));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const result=[...host.querySelectorAll('[data-variant]')].map(e=>({variant:e.dataset.variant,border:getComputedStyle(e).borderWidth,leftBorder:getComputedStyle(e).borderLeftWidth,radius:getComputedStyle(e).borderRadius,shadow:getComputedStyle(e).boxShadow,inlineBorder:e.style.border}));root.unmount();host.remove();return result;
  })()`)
  check('Shared Card variants: CSS ownership, 10px radius, semantic status border',variants.length===5&&variants.every(v=>v.radius==='10px'&&v.inlineBorder==='')&&variants.find(v=>v.variant==='status')?.leftBorder==='3px'&&variants.find(v=>v.variant==='disabled')?.shadow==='none',variants)
  await navigate('/today')
  await click("document.querySelector('button[aria-label*=\"user profile\"]')")
  await click(findButton('Log Out'))
  await delay(500)
  await navigate('/login')
  const signedIn=await click("[...document.querySelectorAll('.auth-mock-btn')].find(e=>e.textContent.includes('Warehouse'))")
  await delay(1000)
  check('Warehouse: real mock role sign-in',signedIn)
  if(signedIn) {
    await navigate('/inventory?tab=new')
    const privacy=await evaluate("({sections:[...document.querySelectorAll('.record-section-link')].map(e=>e.textContent.trim()),moneyControls:document.querySelectorAll('#record-purchase_price,#record-replacement_value,#record-daily_rate,#record-deposit_percent').length,moneyText:/Rs\\.?\\s*[\\d,]/.test(document.querySelector('main')?.innerText||'')})")
    check('Warehouse equipment editor: no monetary controls or figures',privacy.moneyControls===0&&!privacy.moneyText&&!privacy.sections.some(s=>/Purchase|Pricing/.test(s)),privacy)
    await shot('warehouse-equipment-editor')
    await navigate('/finance')
    check('Warehouse direct Finance URL: no monetary figures or payment action',await evaluate("!document.querySelector('[aria-label=\"Record Payment\"]') && !/Rs\\.?\\s*[\\d,]/.test(document.querySelector('main')?.innerText||'')"))
    await shot('warehouse-finance-restricted')
  }
  fs.writeFileSync(path.join(out,'interactions.json'),JSON.stringify({generatedAt:new Date().toISOString(),environment:'isolated local mock; remote requests blocked',limitations:['Technician and Driver have no built-in mock sign-in; covered by role/unit/RLS tests, not impersonated here.','125% matrix uses viewport/device scale emulation, not browser chrome zoom.'],results},null,2))
  console.log(`${results.filter(r=>r.pass).length}/${results.length} browser checks passed`)
  if(results.some(r=>!r.pass)) process.exitCode=1
}
