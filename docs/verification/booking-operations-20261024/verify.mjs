import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { beginVerification, finishVerification } from '../../../scripts/test-receipt.mjs'
const root = process.cwd()
const out = `artifacts/booking-operations-20261024/gates${process.argv[2] ?? ''}`
mkdirSync(out, {recursive:true})
const steps = [
  ['typecheck','npm run typecheck'],
  ['test','npm test -- --maxWorkers=2'],
  ['pglite','npm run check:pglite'],
  ['lifecycle','npm run check:lifecycle'],
  ['lint','npm run lint'],
  ['contrast','npm run check:contrast'],
  ['build','npm run build'],
]
const results=[]
for(const [name,command] of steps) {
  const start=beginVerification(root,command,'local booking Operations pop-up; existing mock and disposable database only')
  const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:100*1024*1024})
  writeFileSync(`${out}/${name}.log`,(result.stdout||'')+(result.stderr||'')+(result.error?String(result.error):''))
  const receipt={...finishVerification(start,root,result.status===0),name,exitCode:result.status}
  results.push(receipt)
  writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2))
  console.log(`${name}: exit ${result.status}; source changed: ${receipt.sourceChanged}`)
}
if(results.some(result=>result.exitCode!==0||result.sourceChanged))process.exitCode=1
