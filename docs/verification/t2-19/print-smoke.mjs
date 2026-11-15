// Exercise the real browser PNG -> PDF export pipeline with synthetic data.
// Reuse the mock-only CDP bootstrap; this never contacts a hosted backend.
import fs from 'node:fs'
const screen = fs.readFileSync('scripts/t2-19-screen-check.mjs','utf8')
const marker = screen.indexOf('  const fixture=await evaluate')
if(marker<0)throw new Error('Mock browser bootstrap changed')
const smoke = `
  const pdf=await evaluate(\`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=160;
    const context=canvas.getContext('2d');context.strokeStyle='#17263d';context.lineWidth=3;
    context.beginPath();context.moveTo(30,100);context.bezierCurveTo(100,15,140,150,190,60);context.bezierCurveTo(210,20,180,140,260,80);context.lineTo(400,90);context.stroke();
    const {exportReturnReportPdf}=await import('/src/lib/pdf/exportPdf.ts');
    const result=await exportReturnReportPdf({bookingNo:'BK-T2-19-SMOKE',clientName:'Synthetic Film Crew',totalUnits:50,returnedUnits:0,missingUnits:0,damagedUnits:50,photosCount:50,lines:[],acknowledgements:[{
      sessionId:'00000000-0000-4000-8000-000000000019',returningName:'Synthetic Courier',recordedAt:'2026-11-08T04:00:00Z',refusalReason:null,signatureUrl:canvas.toDataURL('image/png'),
      flaggedItems:Array.from({length:50},(_,i)=>'Camera unit '+String(i+1).padStart(2,'0')+': Damaged - cracked housing')
    }]});
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(result.blob)});
  })()\`)
  const bytes=Buffer.from(pdf.split(',')[1],'base64')
  fs.writeFileSync(path.join(out,'return-report-signature.pdf'),bytes)
  const text=bytes.toString('latin1')
  if(!text.startsWith('%PDF-1.4')||!text.includes('/Subtype /Image')||!text.includes('Camera unit 50')||!text.includes('/Count 4'))throw Error('Signature/report pagination export failed')
  console.log('PASS: real browser PNG decode, embedded PDF image, all 50 flagged items, four PDF pages; '+bytes.length+' bytes')
}finally{if(socket?.readyState===1)socket.close();chrome.kill()}
`
await import('data:text/javascript;base64,'+Buffer.from(screen.slice(0,marker)+smoke).toString('base64'))
