// Isolated local Chromium checks. The only permitted network origin is dev:mock.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setMaxListeners } from 'node:events'
const origin='http://127.0.0.1:3034', port=19519
const out=path.resolve('docs/verification/t2-19')
fs.mkdirSync(out,{recursive:true})
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new',`--remote-debugging-port=${port}`,'--no-first-run','--no-default-browser-check','--disable-gpu',
  `--user-data-dir=${path.join(os.tmpdir(),`babin-t2-19-${Date.now()}`)}`,'about:blank',
],{windowsHide:true,stdio:'ignore'})
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let socket
try {
  let target
  for(let n=0;n<120&&!target;n++){
    try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page')}catch{}
    if(!target)await delay(250)
  }
  if(!target)throw new Error('Chromium did not start')
  socket=new WebSocket(target.webSocketDebuggerUrl);setMaxListeners(100,socket)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  let sequence=0
  const command=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence
    const timer=setTimeout(()=>{socket.removeEventListener('message',handler);reject(new Error(`Timed out: ${method}`))},30000)
    const handler=e=>{const result=JSON.parse(e.data);if(result.id!==id)return;clearTimeout(timer);socket.removeEventListener('message',handler);result.error?reject(new Error(JSON.stringify(result.error))):resolve(result.result)}
    socket.addEventListener('message',handler);socket.send(JSON.stringify({id,method,params}))
  })
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
  await command('Page.enable');await command('Runtime.enable');await command('Fetch.enable',{patterns:[{urlPattern:'*'}]})
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method!=='Fetch.requestPaused')return;const {requestId,request}=msg.params;const allow=request.url.startsWith(origin)||/^(data:|blob:|about:)/.test(request.url);void command(allow?'Fetch.continueRequest':'Fetch.failRequest',allow?{requestId}:{requestId,errorReason:'BlockedByClient'})})
  const waitFor=async expression=>{for(let n=0;n<150;n++){if(await evaluate(expression))return;await delay(200)}throw new Error(`Screen did not settle: ${expression}`)}
  const navigate=async route=>{await command('Page.navigate',{url:origin+route});await waitFor('!!document.querySelector("#root")?.children.length');await delay(700)}
  await navigate('/login');await waitFor('!!document.querySelector(".auth-mock-btn")')
  await evaluate('document.querySelector(".auth-mock-btn").click()');await delay(1500)
  const fixture=await evaluate(`(async()=>{
    const {supabase,IS_MOCK}=await import('/src/lib/supabase.ts');if(!IS_MOCK)throw Error('Mock backend required');
    const {data:bookings}=await supabase.from('bookings').select('id,booking_no').eq('stage','On Rent').limit(1);
    if(!bookings?.length)throw Error('No On Rent booking in local corpus');
    const booking=bookings[0];const {fetchFloorBooking}=await import('/src/lib/queries/bookings.ts');const floor=await fetchFloorBooking(booking.id);
    const line=floor.lines.find(l=>l.units?.some(u=>u.unitState!=='Returned'))||floor.lines.find(l=>l.trackingMode!=='Consumable'&&l.productId);
    if(!line)throw Error('No returnable fixture line');
    const unit=line.units?.find(u=>u.unitState!=='Returned');
    return {bookingId:booking.id,bookingNo:floor.bookingNo,key:unit?.id||'line:'+line.id,name:line.productName||line.description};
  })()`)
  console.log('Mock fixture',JSON.stringify(fixture))
  await evaluate(`(async()=>{const {supabase}=await import('/src/lib/supabase.ts');const {data:users}=await supabase.from('users').select('*');if(!users.some(u=>u.primary_role==='Technician')){const warehouse=users.find(u=>u.primary_role==='Warehouse');if(!warehouse)throw Error('Warehouse fixture missing');const id=crypto.randomUUID();const {error}=await supabase.from('users').insert({...warehouse,id,client_uuid:id,email:'technician-screen-check@example.test',full_name:'Screen Check Technician',primary_role:'Technician'});if(error)throw Error(error.message)}})()`)
  const results=[]
  const route=`/rentals/${encodeURIComponent(fixture.bookingNo)}/return`
  for(const role of ['Owner','Warehouse','Technician']){
    await evaluate(`(async()=>{const {supabase}=await import('/src/lib/supabase.ts');const {data:users}=await supabase.from('users').select('email,primary_role');const actor=users.find(u=>u.primary_role===${JSON.stringify(role)});if(!actor)throw Error('Role fixture missing');await supabase.auth.signInWithPassword({email:actor.email,password:'local-mock-only'});})()`)
    for(const width of [375,820,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
      await evaluate(`(async()=>{const {saveFloorScan}=await import('/src/lib/floorScanStorage.ts');saveFloorScan('return',${JSON.stringify(fixture.bookingId)},{marks:{[${JSON.stringify(fixture.key)}]:{state:'Not Returned',reason:'Left at the film shoot location',decision:'Still expected'}},scanLog:[],sessionNotes:'',returningName:'',sigReturning:null});})()`)
      await navigate(route);await waitFor('document.body.innerText.includes("Flagged items acknowledgement")')
      const before=await evaluate(`({title:document.body.innerText.includes('Return'),booking:document.body.innerText.includes(${JSON.stringify(fixture.bookingNo)}),flagged:document.body.innerText.includes(${JSON.stringify(fixture.name)}),hasRefusal:[...document.querySelectorAll('label')].some(e=>e.textContent.includes('Refused to sign')),overflow:document.documentElement.scrollWidth>innerWidth+2,money:/Rs\\s*[0-9]|NPR\\s*[0-9]/.test(document.body.innerText)})`)
      await evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Refused to sign'));label.querySelector('input').click()})()`)
      await waitFor('!!document.querySelector("[aria-label=\\"Reason for refusal\\"]")')
      await evaluate(`(()=>{for(const [label,value] of [['Returning person','Courier'],['Reason for refusal','Courier refused after reviewing the flagged items']]){const el=document.querySelector('[aria-label="'+label+'"]');const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}})()`)
      await delay(250)
      const controls=await evaluate(`({refusalVisible:!!document.querySelector('[aria-label="Reason for refusal"]'),name:document.querySelector('[aria-label="Returning person"]')?.value,refusal:document.querySelector('[aria-label="Reason for refusal"]')?.value,minInput:document.querySelector('[aria-label="Returning person"]')?.getBoundingClientRect().height,minReason:document.querySelector('[aria-label="Reason for refusal"]')?.getBoundingClientRect().height,completionEnabled:[...document.querySelectorAll('button')].filter(b=>/^Complete (Session|Return)$/.test(b.textContent.trim())).some(b=>!b.disabled)})`)
      await evaluate(`document.querySelector('[aria-label="Reason for refusal"]').scrollIntoView({block:'center'})`)
      const png=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
      fs.writeFileSync(path.join(out,`${role.toLowerCase()}-${width}.png`),Buffer.from(png.data,'base64'))
      if(!before.title||!before.booking||!before.flagged||!before.hasRefusal||before.overflow||!controls.refusalVisible||!controls.completionEnabled||controls.minInput<44||controls.minReason<44||(role!=='Owner'&&before.money))throw Error(`Screen check failed: ${JSON.stringify({role,width,...before,...controls})}`)
      results.push({role,width,...before,...controls});console.log('PASS',role,width)
    }
  }
  await evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(e=>e.textContent.includes('Refused to sign'));label.querySelector('input').click()})()`)
  await delay(150)
  await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Sign on Glass');if(!button)throw Error('Capture signature button missing');button.click()})()`)
  await waitFor('!!document.querySelector("[role=dialog]")')
  for(const width of [375,820,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(200)
    const modal=await evaluate(`(()=>{const dialog=document.querySelector('[role=dialog]');const button=[...dialog.querySelectorAll('button')].find(e=>e.textContent.includes('Accept & Sign Return'));return {title:dialog.textContent.includes('Equipment Return'),flaggedList:dialog.textContent.includes(${JSON.stringify(fixture.name)}),canvas:!!dialog.querySelector('canvas'),width:dialog.getBoundingClientRect().width,overflow:dialog.scrollWidth>dialog.clientWidth+2,primaryHeight:button?.getBoundingClientRect().height}})()`)
    const png=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    fs.writeFileSync(path.join(out,`signature-modal-${width}.png`),Buffer.from(png.data,'base64'))
    if(!modal.flaggedList||!modal.canvas||modal.width>width||modal.overflow||modal.primaryHeight<44)throw Error(`Signature modal failed: ${JSON.stringify({width,...modal})}`)
    results.push({state:'signature-modal',viewport:width,...modal})
  }
  await evaluate(`(()=>{const dialog=document.querySelector('[role=dialog]');[...dialog.querySelectorAll('button')].find(e=>e.textContent.trim()==='Cancel').click()})()`)
  await command('Network.enable')
  await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await waitFor('document.body.innerText.includes("Needs connection")')
  results.push({state:'offline',completionBlocked:true})
  await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await evaluate(`(async()=>{const {supabase}=await import('/src/lib/supabase.ts');const {data:users}=await supabase.from('users').select('email,primary_role');const actor=users.find(u=>u.primary_role==='Accounts');await supabase.auth.signInWithPassword({email:actor.email,password:'local-mock-only'});})()`)
  await navigate(route)
  const restricted=await evaluate('document.body.innerText')
  if(restricted.includes('Flagged items acknowledgement'))throw Error('Accounts unexpectedly offered a Return acknowledgement')
  results.push({state:'restricted',role:'Accounts',acknowledgementHidden:true})
  fs.writeFileSync(path.join(out,'screen-check.json'),JSON.stringify({fixture,results},null,2)+'\n')
}finally{if(socket?.readyState===1)socket.close();chrome.kill()}
