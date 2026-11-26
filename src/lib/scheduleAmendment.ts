import { formatAdDateTime } from './bs'
import { loadNepaliFonts } from './i18n'

export interface ScheduleAmendment {
  proposalId:string; bookingId:string; originalDocumentNo:string; originalHash:string
  pickupAt:string; returnAt:string; signerName:string; signerRole:string; signedAt:string; signatureDataUrl:string
}
/** One image-backed page preserves self-hosted Nepali glyphs and the actual drawn
 * mark. The immutable original remains a separately linked document, unchanged. */
export function jpegPagePdf(jpeg:Uint8Array,width:number,height:number):Uint8Array {
  const encoder=new TextEncoder()
  const chunks:Uint8Array[]=[encoder.encode('%PDF-1.4\n')]
  const offsets=[0]
  let size=chunks[0]?.length??0
  const append=(bytes:Uint8Array)=>{chunks.push(bytes);size+=bytes.length}
  const object=(number:number,body:string|Uint8Array)=>{
    offsets[number]=size
    append(encoder.encode(number+' 0 obj\n'))
    append(typeof body==='string'?encoder.encode(body):body)
    append(encoder.encode('\nendobj\n'))
  }
  object(1,'<< /Type /Catalog /Pages 2 0 R >>')
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /PageImage 4 0 R >> >> /Contents 5 0 R >>')
  const imageHead=encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  const imageEnd=encoder.encode('\nendstream')
  const imageBody=new Uint8Array(imageHead.length+jpeg.length+imageEnd.length)
  imageBody.set(imageHead);imageBody.set(jpeg,imageHead.length);imageBody.set(imageEnd,imageHead.length+jpeg.length)
  object(4,imageBody)
  const stream='q\n595 0 0 842 0 0 cm\n/PageImage Do\nQ\n'
  object(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`)
  const start=size
  append(encoder.encode('xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`))
  const result=new Uint8Array(size);let position=0
  for(const chunk of chunks){result.set(chunk,position);position+=chunk.length}
  return result
}
export async function createScheduleAmendment(input:ScheduleAmendment):Promise<Blob> {
  const signerText=input.signerName+' '+input.signerRole
  if(/[\u0900-\u097f]/.test(signerText))await loadNepaliFonts()
  await Promise.all([
    document.fonts.load('400 28px "Source Sans 3"'),
    document.fonts.load('600 30px "Source Sans 3"'),
    document.fonts.load('400 24px "JetBrains Mono Variable"'),
    ...(/[\u0900-\u097f]/.test(signerText)?[
      document.fonts.load('400 28px "Hind"',signerText),
      document.fonts.load('600 30px "Hind"',signerText),
    ]:[]),
  ])
  await document.fonts.ready
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754
  const context=canvas.getContext('2d')
  if(!context)throw new Error('Signature document rendering is unavailable. Use a signed PDF instead.')
  const c=context
  c.fillStyle='#ffffff';c.fillRect(0,0,1240,1754);c.fillStyle='#161616'
  let y=100
  const text=(value:string,size=28,bold=false)=>{
    const family=/[0-9]/.test(value)?'"JetBrains Mono Variable", "Hind", monospace':'"Source Sans 3", "Hind", sans-serif'
    c.font=`${bold?'600':'400'} ${size}px ${family}`
    let line=''
    for(const word of value.split(' ')){
      if(c.measureText(word).width>1070)throw new Error('Signer details exceed one amendment page. Use a signed PDF with a complete layout instead.')
      const next=line?line+' '+word:word
      if(c.measureText(next).width>1070 && line){c.fillText(line,84,y);y+=size*1.5;line=word}else line=next
    }
    c.fillText(line,84,y);y+=size*1.5
  }
  text('BABIN RENTALS',30,true);text('Rental schedule amendment',46,true)
  y+=28;text('Original agreement: '+input.originalDocumentNo,28,true)
  text('Rental reference: '+input.bookingId,24)
  text('New pickup: '+formatAdDateTime(input.pickupAt),30,true)
  text('New return: '+formatAdDateTime(input.returnAt),30,true)
  y+=20;text('Only the schedule changes. Rental duration, prices and all other terms in the original agreement remain unchanged.')
  text('This amendment is retained with the original agreement. Neither the original document nor its signatures are erased.')
  y+=25;text('Signer: '+input.signerName,30,true);text('Capacity: '+input.signerRole)
  text('Captured: '+formatAdDateTime(input.signedAt),24)
  const signature=new Image()
  signature.src=input.signatureDataUrl
  await signature.decode()
  c.drawImage(signature,84,y+20,850,240);y+=290
  text('Original SHA-256:',20,true)
  text(input.originalHash.slice(0,32),20);text(input.originalHash.slice(32),20)
  text('Proposal: '+input.proposalId,20)
  if(y>1660)throw new Error('Signer details exceed one amendment page. Use a signed PDF with a complete layout instead.')
  const encoded=canvas.toDataURL('image/jpeg',0.94).split(',')[1]
  if(!encoded)throw new Error('The signed document could not be rendered.')
  const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0))
  return new Blob([jpegPagePdf(bytes,1240,1754) as BlobPart],{type:'application/pdf'})
}
