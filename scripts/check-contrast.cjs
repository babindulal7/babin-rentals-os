/* v4.1 §7.8 release gate, run against the SHIPPED theme.css.
   Parses the real file so this measures what merged, not what was intended. */
const fs=require('fs')
const css=fs.readFileSync(require('path').join(__dirname,'..','src','styles','theme.css'),'utf8').replace(/\r\n/g,'\n')
const pilotPath=fs.existsSync(require('path').join(__dirname,'..','src','styles','shadcn-preset-pilot.css'))
  ? require('path').join(__dirname,'..','src','styles','shadcn-preset-pilot.css')
  : require('path').join(__dirname,'..','src','styles','ui-v2.css')
const pilotRaw=fs.readFileSync(pilotPath,'utf8').replace(/\r\n/g,'\n')
const pilot=pilotPath.endsWith('ui-v2.css')
  ? (pilotRaw.slice(pilotRaw.indexOf('[data-ui-preset="rhea"]')).match(/\{([\s\S]*?)\}/)?.[1] ?? '')
  : pilotRaw
const entry=fs.readFileSync(require('path').join(__dirname,'..','src','main.tsx'),'utf8')
const lumaPath=require('path').join(__dirname,'..','src','styles','shadcn-luma-ui.css')
const luma=entry.includes("import './styles/shadcn-luma-ui.css'")&&fs.existsSync(lumaPath)?fs.readFileSync(lumaPath,'utf8'):null

function declarations(source,selector){
  const i=source.indexOf(selector);if(i<0)throw new Error('missing '+selector)
  const start=source.indexOf('{',i),end=source.indexOf('}',start)
  return Object.fromEntries([...source.slice(start+1,end).matchAll(/(?:^|[;\n])\s*([a-z0-9-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]))
}
function colour(value,tokens,background,depth=0){
  if(!value||depth>8)return null
  const mix=value.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/)
  if(mix){
    const foreground=colour(mix[1],tokens,background,depth+1)
    if(!foreground||!background)return null
    return hex(over([...rgb(foreground).slice(0,3),Number(mix[2])/100],rgb(background)))
  }
  const reference=value.match(/^var\((--[a-z0-9-]+)(?:,\s*([^)]*))?\)$/)
  if(reference)return colour(tokens[reference[1]]??reference[2],tokens,background,depth+1)
  const parsed=rgb(value)
  if(!parsed){
    if(value==='transparent')return background??null
    if(['inherit','initial','unset','currentColor'].includes(value))return null
    throw new Error('Unsupported effective contrast colour: '+value)
  }
  if(parsed[3]===1)return hex(parsed)
  return background?hex(over(parsed,rgb(background))):null
}

function block(sel,source=css){
  const i=source.indexOf(sel); if(i<0) throw new Error('missing '+sel)
  const s=source.indexOf('{',i), e=source.indexOf('\n}',s)
  const out={}
  for(const m of source.slice(s,e).matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]]=m[2]
  return out
}
/* v4.2 §2.1 flipped the default: bare :root now carries the LIGHT values and
   dark is the addressed theme. The selectors here mirror theme.css exactly —
   this gate parses the shipped file, so it must track the shipped shape. */
const D=block(":root[data-theme='dark'] {")
const L=block(":root,\n:root[data-theme='light'] {")
const H=block(":root[data-theme='high-contrast'] {")
const darkTokens=declarations(css,":root[data-theme='dark'] {")
const lightTokens=declarations(css,":root,\n:root[data-theme='light'] {")
const highTokens=declarations(css,":root[data-theme='high-contrast'] {")
for(const [T,tokens] of [[D,darkTokens],[L,lightTokens]])for(const key of Object.keys(T)){
  if(tokens[key])T[key]=colour(tokens[key],tokens,T['--bg'])
}
// Resolve translucent overlay surfaces instead of silently retaining old hex values.
for(const [T,tokens] of [[D,darkTokens],[L,lightTokens]])for(const [key,under] of [['--nav-active-bg','--sidebar'],['--hover-card','--card']]){
  const composed=colour(tokens[key],tokens,T[under]);if(composed)T[key]=composed
}
// A scoped background token must never overwrite foreground --muted again.
for(const m of pilot.matchAll(/\n\s*(--[a-z0-9-]+):/g)) {
  if(!m[1].startsWith('--rhea-')&&!m[1].startsWith('--shadow-rhea-')) throw new Error('Unnamespaced pilot token: '+m[1])
}
const pilotRoles={}
for(const m of pilot.matchAll(/\n\s*(--rhea-[a-z0-9-]+):\s*var\((--[a-z0-9-]+)\);/g)) pilotRoles[m[1]]=m[2]
for(const [role,base] of Object.entries({'--rhea-muted-fg':'--muted','--rhea-card':'--card','--rhea-card-fg':'--text','--rhea-primary':'--btn-primary-bg','--rhea-primary-fg':'--btn-primary-fg'})) {
  if(pilotRoles[role]!==base) throw new Error('Pilot colour role must inherit active theme: '+role+' -> '+base)
}

function srgb(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
function lum(x){const h=x.replace('#','')
 return 0.2126*srgb(parseInt(h.slice(0,2),16))+0.7152*srgb(parseInt(h.slice(2,4),16))+0.0722*srgb(parseInt(h.slice(4,6),16))}
function ratio(a,b){const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)}

let fails=0,n=0
function chk(theme,T,label,fg,bg,need){
  const f=T[fg],b=T[bg]
  if(!f||!b){console.log(`MISS  ${theme} ${label}: ${fg}=${f} ${bg}=${b}`);fails++;return}
  const r=ratio(f,b); n++
  const ok=r>=need; if(!ok)fails++
  console.log(`${ok?'PASS':'FAIL'} ${r.toFixed(2).padStart(6)}:1 (>=${need})  ${theme} ${label.padEnd(28)} ${f} on ${b}`)
}
for(const [theme,T] of [['DARK ',D],['LIGHT',L]]){
  // §7.8: every on-colour on its hue
  chk(theme,T,'on-primary / primary','--on-primary','--primary',4.5)
  chk(theme,T,'on-success / success','--on-success','--success',4.5)
  chk(theme,T,'on-danger / danger','--on-danger','--danger',4.5)
  chk(theme,T,'on-warn / warn','--on-warn','--warn',4.5)
  chk(theme,T,'on-ready / ready','--on-ready','--ready',4.5)
  chk(theme,T,'on-neutral / neutral','--on-neutral','--neutral',4.5)
  chk(theme,T,'on-dim / dim','--on-dim','--dim',4.5)
  // §7.8: --text-2 (= --muted) on --surface, and the body ink
  chk(theme,T,'muted(text-2) / surface','--muted','--surface',4.5)
  chk(theme,T,'text / surface','--text','--surface',4.5)
  chk(theme,T,'text2 / surface','--text2','--surface',4.5)
  /*
   * v4.1 bug, found on /dashboard by Lighthouse: `--muted` was only ever
   * checked against `--surface`. It is overwhelmingly painted on the app's
   * TINTED surfaces, and #6d7076 measured 4.48:1 on #eef4fb and 4.45:1 on
   * #edf3fa — under AA — while passing 4.97:1 on white. A token that passes
   * the gate and fails the screen is worse than no gate, because it reports
   * green. These four pairs are the ones that actually shipped broken.
   */
  chk(theme,T,'muted / surface-2 (tinted)','--muted','--surface-2',4.5)
  chk(theme,T,'muted / card2 (tinted)','--muted','--card2',4.5)
  chk(theme,T,'muted / bg (canvas)','--muted','--bg',4.5)
  chk(theme,T,'muted / inset2 (darkest)','--muted','--inset2',4.5)
  /*
   * The same class of bug in the DARK sidebar: `--nav-active-accent` paints
   * the ACTIVE destination on the rail, and #386af7 measured 4.30:1 on
   * #050b12. Where the app tells you where you are cannot be the faintest
   * text on the screen. Three backgrounds, because the accent is used as ink
   * both inside and outside the active pill.
   */
  chk(theme,T,'nav-active-accent / sidebar','--nav-active-accent','--sidebar',4.5)
  chk(theme,T,'nav-active-accent / nav-bg','--nav-active-accent','--nav-active-bg',4.5)
  chk(theme,T,'nav-active-accent / surface','--nav-active-accent','--surface',4.5)
  // §7.8: --ext text on both backgrounds
  chk(theme,T,'ext-fg / surface','--ext-fg','--surface',4.5)
  chk(theme,T,'ext-fg / bg','--ext-fg','--bg',4.5)
  chk(theme,T,'ext-line / surface (3:1)','--ext-line','--surface',3.0)
  // v4.2 §3 — the gold outline on the CANVAS gradient's darker stop. This is
  // the warning the spec ships with the cream canvas: the mark must stay
  // legible on it, and #af903a measured 2.70:1 there before the fix.
  chk(theme,T,'ext-line / bg-gradient-1 (3:1)','--ext-line','--bg-gradient-1',3.0)
  // status text-safe variants used as micro-copy on cards
  chk(theme,T,'primary-text / surface','--primary-text','--surface',4.5)
  chk(theme,T,'success-text / surface','--success-text','--surface',4.5)
  chk(theme,T,'danger-text / surface','--danger-text','--surface',4.5)
  chk(theme,T,'warn-text / surface','--warn-text','--surface',4.5)
  chk(theme,T,'ready-text / surface','--ready-text','--surface',4.5)
  // primary button ink
  chk(theme,T,'btn-primary fg/bg','--btn-primary-fg','--btn-primary-bg',4.5)
  // Shared primary hover and the neutral WhatsApp link read these exact tokens.
  chk(theme,T,'btn-primary fg/hover','--btn-primary-fg','--hover-button',4.5)
  chk(theme,T,'WhatsApp ink / card','--text','--card',4.5)
  chk(theme,T,'WhatsApp ink / hover','--text','--hover-card',4.5)
  chk(theme,T,'report muted / card','--muted','--card',4.5)
  console.log('')
}
for(const [theme,T] of [['PILOT-D',D],['PILOT-L',L],['PILOT-H',H]]) {
  const roles={...T,...Object.fromEntries(Object.entries(pilotRoles).map(([role,base])=>[role,T[base]]))}
  chk(theme,roles,'KPI label / card','--rhea-muted-fg','--rhea-card',4.5)
  chk(theme,roles,'KPI value / card','--rhea-card-fg','--rhea-card',4.5)
  chk(theme,roles,'primary foreground / fill','--rhea-primary-fg','--rhea-primary',4.5)
}
if(luma){
  const primary=declarations(luma,'.ui-button--primary {'),tag=declarations(luma,'.tag {')
  for(const [name,T,tokens]of [['LUMA-D',D,darkTokens],['LUMA-L',L,lightTokens],['LUMA-H',H,highTokens]]){
    const colours={
      '--button-fg':colour(primary.color,tokens,T['--card'])??T['--text'],
      '--button-bg':colour(primary.background,tokens,T['--card'])??T['--card'],
      '--tag-fg':colour(tag.color,tokens,T['--card'])??T['--text'],
      '--tag-bg':colour(tag.background,tokens,T['--card'])??T['--card'],
      '--tag-canvas-bg':colour(tag.background,tokens,T['--bg'])??T['--bg'],
    }
    chk(name,colours,'primary foreground / fill','--button-fg','--button-bg',4.5)
    chk(name,colours,'tag ink / card wash','--tag-fg','--tag-bg',4.5)
    chk(name,colours,'tag ink / canvas wash','--tag-fg','--tag-canvas-bg',4.5)
  }
}
for(const [label,fg,bg] of [
  ['btn-primary fg/bg','--btn-primary-fg','--btn-primary-bg'],
  ['btn-primary fg/hover','--btn-primary-fg','--hover-button'],
  ['WhatsApp ink / card','--text','--card'],
  ['WhatsApp ink / hover','--text','--hover-card'],
]) chk('HIGH ',H,label,fg,bg,4.5)

function rgb(v){if(!v)return null
  if(/^#[0-9a-fA-F]{6}$/.test(v))return [1,3,5].map(k=>parseInt(v.slice(k,k+2),16)).concat(1)
  const m=v.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
  return m&&[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]}
function over([r,g,b,a],[R,G,B]){return [r*a+R*(1-a),g*a+G*(1-a),b*a+B*(1-a)]}
function hex(c){return '#'+c.slice(0,3).map(x=>Math.round(x).toString(16).padStart(2,'0')).join('')}
console.log(`${n-fails}/${n} pass, ${fails} FAIL`)
process.exit(fails?1:0)
