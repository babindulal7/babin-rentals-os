import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { beginVerification, finishVerification } from './scripts/test-receipt.mjs';
const root = process.cwd();
const out = 'artifacts/coss-search-validation';
mkdirSync(out, { recursive: true });
const steps = [
 ['typecheck', ['run','typecheck']],
 ['test', ['test','--','--maxWorkers=2']],
 ['pglite', ['run','check:pglite']],
 ['lifecycle', ['run','check:lifecycle']],
 ['lint', ['run','lint']],
 ['contrast', ['run','check:contrast']],
 ['build', ['run','build']],
];
const results = [];
for (const [name,args] of steps) {
 const start = beginVerification(root, `npm ${args.join(' ')}`, 'local coss booking search verification');
 const r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d','/s','/c',`npm ${args.join(' ')}`], {cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:80*1024*1024});
 writeFileSync(`${out}/${name}.log`,(r.stdout || '')+(r.stderr || '')+(r.error ? '\n'+r.error.message : ''));
 const result = {...finishVerification(start,root,r.status === 0),name,exitCode:r.status};
 results.push(result);
 writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
 console.log(`${name}: exit ${r.status}; source changed: ${result.sourceChanged}`);
}
