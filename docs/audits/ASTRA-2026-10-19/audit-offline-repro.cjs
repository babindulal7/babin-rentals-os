const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const rows=[{id:1,clientUuid:'original-request',table:'booking_notes',action:'update',payload:{id:'not-visible',note:'unsynced work'},timestamp:'2026-10-18T00:00:00Z',status:'pending'}];
const events=[];
class Dexie {
 constructor(){this.mutations={where:key=>({equals:value=>({toArray:async()=>rows.filter(r=>r[key]===value),sortBy:async()=>rows.filter(r=>r[key]===value)}),anyOf:()=>({modify:async()=>{}})}),update:async(id,value)=>Object.assign(rows.find(r=>r.id===id),value),delete:async id=>{events.push('deleted:'+id);rows.splice(rows.findIndex(r=>r.id===id),1)}};this.conflicts={add:async()=>{}};}
 version(){return {stores:()=>{},upgrade:()=>{}};}
}
const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})}),update:()=>({eq:async()=>{events.push('zero-row-server-result');return {data:null,error:null,count:0};}})})};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/offlineQueue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,useDefineForClassFields:false}}).outputText,{module:mod,exports:mod.exports,require:n=>n==='dexie'?Dexie:n==='./supabase'?{supabase:client}:{captureError:()=>{}},window:{addEventListener:()=>{}},indexedDB:{},navigator:{onLine:false},console,Date,Set});
(async()=>{await mod.exports.drainQueue();assert.equal(rows.length,1); // offline guard
 // Drain uses the same global navigator object; switch online after import to avoid boot drain.
})();
// A second isolated evaluation allows the boot drain; give it a controlled online event instead.
const nav={onLine:false},out={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/offlineQueue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,useDefineForClassFields:false}}).outputText,{module:out,exports:out.exports,require:n=>n==='dexie'?Dexie:n==='./supabase'?{supabase:client}:{captureError:()=>{}},window:{addEventListener:()=>{}},indexedDB:{},navigator:nav,console,Date,Set});
setImmediate(async()=>{nav.onLine=true;await out.exports.drainQueue();assert.equal(rows.length,0);assert.deepEqual(events,['zero-row-server-result','deleted:1']);console.log('REPRODUCED: a zero-row UPDATE with no SQL error removes the pending mutation as successful. No receipt/affected-row check.');});

