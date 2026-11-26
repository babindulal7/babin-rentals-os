import fs from 'node:fs';

const files = fs.readdirSync('dist/assets');
const qrcodeChunk = files.find(f => f.startsWith('vendor-qrcode-') && f.endsWith('.js'));
console.log('Target chunk:', qrcodeChunk);

const graph = new Map();
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const content = fs.readFileSync('dist/assets/' + file, 'utf8');
  const imports = [];
  const regex = /from\s*["']\.\/([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  graph.set(file, imports);
}

// Find direct importers of target
console.log('\nDirect static importers of', qrcodeChunk, ':');
const direct = [];
for (const [file, imports] of graph.entries()) {
  if (imports.includes(qrcodeChunk)) {
    console.log(' -', file);
    direct.push(file);
  }
}

// Check who imports those direct importers
console.log('\nSecondary importers:');
for (const [file, imports] of graph.entries()) {
  for (const d of direct) {
    if (imports.includes(d)) {
      console.log(` - ${file} imports ${d}`);
    }
  }
}
