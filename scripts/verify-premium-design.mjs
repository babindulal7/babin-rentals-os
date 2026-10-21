// Local checks only. Never includes a deploy, Git write, remote DB or data command.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { verificationSourceHash } from './test-receipt.mjs'

const root=process.cwd()
const out=path.resolve('docs/verification/premium-design')
fs.mkdirSync(out,{recursive:true})
const steps=[
  ['typecheck','npm run typecheck'],
  ['test','npm test -- --maxWorkers=2'],
  ['pglite','npm run check:pglite'],
  ['lifecycle','npm run check:lifecycle'],
  ['contrast','npm run check:contrast'],
  ['lint','npm run lint'],
  ['shell','npm run lint:shell'],
  ['copy','npm run lint:ui-copy'],
  ['build','npm run build'],
]
const selected=process.argv[2]?.split(',')
const manifest={startedAt:new Date().toISOString(),environment:'local; mock browser and in-process PGlite only; no remote writes',steps:[]}
for(const [name,cmd] of steps) {
  if(selected&&!selected.includes(name)) continue
  const sourceHash=verificationSourceHash(root)
  const started=Date.now()
  console.log(`START ${cmd}`)
  const logfile=path.join(out,`${name}.log`)
  const stream=fs.createWriteStream(logfile)
  const child=spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',cmd],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
  child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false})
  const code=await new Promise(resolve=>{child.on('error',e=>{stream.write(String(e));resolve(1)});child.on('close',code=>resolve(code??1))})
  await new Promise(resolve=>stream.end(resolve))
  const afterHash=verificationSourceHash(root)
  const record={name,command:cmd,exitCode:code,sourceHash,afterHash,sourceChanged:sourceHash!==afterHash,seconds:Math.round((Date.now()-started)/1000),log:path.relative(root,logfile)}
  manifest.steps.push(record)
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(manifest,null,2)+'\n')
  console.log(`${code===0?'PASS':'FAIL'} ${cmd} (${record.seconds}s)${record.sourceChanged?' — source changed during this check':''}`)
  if(code!==0) console.log(fs.readFileSync(logfile,'utf8').split('\n').slice(-18).join('\n'))
}
manifest.finishedAt=new Date().toISOString()
manifest.currentHash=verificationSourceHash(root)
manifest.allPassed=manifest.steps.every(s=>s.exitCode===0)
manifest.stable=manifest.steps.every(s=>!s.sourceChanged&&s.sourceHash===manifest.currentHash)
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(manifest,null,2)+'\n')
if(!manifest.allPassed) process.exitCode=1
