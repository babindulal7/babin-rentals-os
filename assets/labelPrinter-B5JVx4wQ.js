import{Q as f,B as b}from"./vendor-scanner-DNvoyQWO.js";const u={standard:{widthMm:50,heightMm:25,name:'50mm × 25mm (2" × 1")',description:"Standard equipment & camera bodies"},case:{widthMm:70,heightMm:35,name:"70mm × 35mm (Case Tag)",description:"Flightcases, pelicans & kit bags"},cable:{widthMm:30,heightMm:15,name:"30mm × 15mm (Accessory Tag)",description:"Cables, batteries & small accessories"}},w=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"],h=104,x=106;function v(o,t=40){const s=o.replace(/[^\x20-\x7E]/g,"");if(!s)return"<svg></svg>";const e=[h];let n=h;for(let r=0;r<s.length;r++){const m=s.charCodeAt(r)-32;e.push(m),n+=m*(r+1)}const l=n%103;e.push(l),e.push(x);let c="";for(const r of e)c+=w[r]||"212222";let i=0,a=!0;const p=[];for(let r=0;r<c.length;r++){const m=parseInt(c[r]||"1",10);a&&p.push(`<rect x="${i}" y="0" width="${m}" height="${t}" fill="#000000" />`),i+=m,a=!a}return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${i} ${t}" width="100%" height="${t}" preserveAspectRatio="none">${p.join("")}</svg>`}function $(o,t=120){const s=o.trim();if(!s)return"<svg></svg>";const e=new f().encode(s,b.QR_CODE,t,t,new Map),n=e.getWidth(),l=e.getHeight(),c=[];for(let i=0;i<l;i++)for(let a=0;a<n;a++)e.get(a,i)&&c.push(`<rect x="${a}" y="${i}" width="1" height="1"/>`);return`<svg xmlns="http://www.w3.org/2000/svg" data-symbology="qr" viewBox="0 0 ${n} ${l}" width="100%" height="${t}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect width="${n}" height="${l}" fill="#fff"/><g fill="#000">${c.join("")}</g></svg>`}function d(o){return o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function y(o,t="standard"){const s=u[t],e=o.symbology==="qr"?$(o.barcodeValue,t==="case"?78:52):v(o.barcodeValue,t==="cable"?24:36),n=o.orgName||"BABIN RENTALS OS · KATHMANDU",l=d(o.assetCode),c=d(o.title),i=o.subtitle?d(o.subtitle):"",a=o.serialNo?d(o.serialNo):"",p=d(o.barcodeValue),g=d(n);return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Label — ${l}</title>
<style>
  @page {
    size: ${s.widthMm}mm ${s.heightMm}mm;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: ${s.widthMm}mm;
    height: ${s.heightMm}mm;
    background: #ffffff;
    color: #000000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
    padding: ${t==="cable"?"1.5mm 2mm":"2.5mm 3mm"};
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 1.5px;
    margin-bottom: 2px;
  }
  .org-name {
    font-size: ${t==="cable"?"6px":"7.5px"};
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .asset-code {
    font-family: "Courier New", Courier, monospace;
    font-size: ${t==="cable"?"8px":"10px"};
    font-weight: 900;
  }
  .title-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }
  .title {
    font-size: ${t==="cable"?"8px":t==="case"?"12px":"10px"};
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    font-size: ${t==="cable"?"6.5px":"8px"};
    color: #333;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barcode-wrap {
    width: 100%;
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .barcode-text {
    font-family: "Courier New", Courier, monospace;
    font-size: ${t==="cable"?"6.5px":"8px"};
    font-weight: 700;
    letter-spacing: 1px;
    margin-top: 1px;
  }
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <div class="header">
    <span class="org-name">${g}</span>
    <span class="asset-code">${l}</span>
  </div>
  <div class="title-block">
    <div class="title">${c}</div>
    ${i||a?`<div class="subtitle">${i}${a?` · SN: ${a}`:""}</div>`:""}
  </div>
  <div class="barcode-wrap">
    ${e}
    <div class="barcode-text">${p}</div>
  </div>
</body>
</html>`}function C(o,t="standard"){var l,c;const s=y(o,t),e=document.createElement("iframe");e.style.position="fixed",e.style.right="0",e.style.bottom="0",e.style.width="0",e.style.height="0",e.style.border="0",document.body.appendChild(e);const n=(l=e.contentWindow)==null?void 0:l.document;n&&(n.open(),n.write(s),n.close(),(c=e.contentWindow)==null||c.focus(),setTimeout(()=>{var i;(i=e.contentWindow)==null||i.print(),setTimeout(()=>{document.body.removeChild(e)},1e3)},250))}export{u as L,$ as a,v as g,C as p};
