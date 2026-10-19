const fs=require('fs'), vm=require('vm'), ts=require('typescript'), path=require('path'), assert=require('assert');
const root=process.cwd();
function load(rel, supabase){ const filename=path.join(root,rel); const out=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; const module={exports:{}}; vm.runInNewContext(out,{exports:module.exports,module,require:(name)=> name==='../supabase'?{supabase}:name==='../money'?{rupees:n=>Math.round(n*100)}:name==='../rentalDays'?{rentalDaysBetween:()=>1}:require(name),console,Date,Map,Set}, {filename}); return module.exports; }
function db(response){ return {from:()=>{const q={}; for(const k of ['select','order','gte','lte','eq']) q[k]=()=>q; q.then=(resolve,reject)=>Promise.resolve(response).then(resolve,reject);return q;}};}
(async()=>{
 const sales=load('src/lib/queries/salesVatReports.ts',db({data:null,error:{message:'column invoices.tax_amount does not exist'}})); const fabricated=await sales.getSalesVatReport({from:'2099-01-01',to:'2099-01-02'}); assert.equal(fabricated.sales.metrics.invoiceCount,42); console.log('VERIFIED: sales error -> 42 invented invoices; total paisa '+fabricated.sales.metrics.totalInvoiced);
 const rental=load('src/lib/queries/rentalReports.ts',db({data:[{id:'a',booking_no:'1',stage:'Closed',pickup_at:'2026-10-18T03:15:00Z',return_at:'2026-10-18T12:15:00Z',project:'Real project',clients:{name:'Real client'},booking_lines:[{qty:1,days:1,rate:1000,discount_amount:0,voided_at:null}]}],error:null})); const result=await rental.getRentalPerformanceReport(); assert.equal(result.metrics.totalRevenue,1000);assert.equal(result.metrics.completedRentals,0);console.log('VERIFIED: Closed booking Rs1000 -> report paisa '+result.metrics.totalRevenue+' (Rs10), completedRentals '+result.metrics.completedRentals);
 const cancel=load('src/lib/queries/rentalReports.ts',db({data:null,error:{message:'invalid input value for enum booking_stage: Cancelled'}})); const c=await cancel.getCancellationsReport();assert.equal(c.totalCancellations,8);console.log('VERIFIED: invalid cancellation enum/error -> 8 invented cancellations');
})();

// Pure engine controls: load exact source, no browser or remote database access.
function pure(rel) {
 const filename=path.join(root,rel);const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:module.exports,module,require:name=>pure(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))),Date,Math,Number,Map,Set,console},{filename}); return module.exports;
}
const days=pure('src/lib/rentalDays.ts');
assert.equal(days.rentalDaysBetween('2026-10-18T06:00:00+05:45','2026-10-19T06:00:00+05:45'),1);
assert.equal(days.rentalDaysBetween('2026-10-18T20:00:00+05:45','2026-10-19T08:00:00+05:45'),2);
const pricing=pure('src/lib/pricingPipeline.ts');
assert.deepEqual([500000,500100,1000000,1200000].map(pricing.calculateAdvanceRequired),[500000,500000,500000,600000]);
console.log('PASS controls: 06:00 NPT half-open rental days and advance 5000/5001/10000/12000 boundaries');
const bs=pure('src/lib/bs.ts'), op=pure('src/lib/operationalDay.ts');
const early=new Date('2026-10-19T05:30:00+05:45');
assert.equal(bs.businessDayAd(early),'2026-10-19');assert.equal(op.operationalDayOf(early.toISOString(),360),'2026-10-18');
console.log('VERIFIED: dashboard civil today at 05:30NPT=2026-10-19 while operational shift=2026-10-18');
