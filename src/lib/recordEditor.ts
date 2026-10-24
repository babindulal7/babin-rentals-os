import { canonicalPhone, isValidLocalPhone } from './phone'
import { parseMoney, toRupees } from './money'

export type RecordKind = 'client' | 'equipment' | 'bundle'
export type RecordValue = string | number | boolean | null
export type RecordValues = Record<string, RecordValue>
export interface RecordSnapshot { id: string; code: string; revision: string; values: RecordValues; rows: RecordValues[] }
export interface RecordSectionChange { section: string; fields: RecordValues; rows?: RecordValues[] | undefined }
/** Only the committed section may replace local input; sibling drafts stay intact. */
export function applySavedRecordSection(local: { values: RecordValues; rows: RecordValues[] }, saved: RecordSnapshot, change: RecordSectionChange) {
  const values = { ...local.values }
  for (const key of Object.keys(change.fields)) values[key] = saved.values[key] ?? null
  return { values, rows: change.rows === undefined ? local.rows : saved.rows }
}
export function recordSectionKey(title: string): string {
  return ({ Addresses: 'address', 'Commercial details': 'commercial', 'Stock & Units': 'stock', 'Pricing & Rental': 'pricing', 'Maintenance & Documents': 'maintenance' } as Record<string, string>)[title] ?? title.toLowerCase()
}
export interface RecordField { key: string; label: string; section: string; type?: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'checkbox' | 'select'; required?: boolean; options?: readonly string[]; source?: 'categories' | 'warehouses'; createOnly?: boolean }
const field = (key: string, label: string, section: string, rest: Omit<RecordField, 'key' | 'label' | 'section'> = {}): RecordField => ({ key, label, section, ...rest })
export const recordFields: Record<RecordKind, RecordField[]> = {
  client: [
    field('type_parent','Client type','Identity',{type:'select',options:['Organisation','Individual']}),
    field('name','Name','Identity',{required:true}),
    field('org_subtype','Organisation type','Identity',{type:'select',options:['Production House','Rental House','College / Institution','Corporate / Agency','Government / NGO','Broadcaster','Other']}),
    field('pan_vat','PAN/VAT','Identity'),field('business_registration','Business registration','Identity'),
    field('phone','Phone number','Contact',{required:true}),field('email','Email','Contact'),field('website','Website','Contact'),
    field('address_line','Address','Addresses'),field('city','City','Addresses'),field('district','District','Addresses'),field('postal_code','Postal code','Addresses'),field('country','Country','Addresses'),field('billing_address','Billing address','Addresses',{type:'textarea'}),
    field('notes','Notes','Notes',{type:'textarea'}),
  ],
  equipment: [
    field('name','Equipment name','Identity',{required:true}),field('short_name','Short name','Identity'),field('category_id','Category','Identity',{type:'select',source:'categories',required:true}),field('brand','Brand','Identity',{required:true}),field('model','Model','Identity'),field('manufacturer','Manufacturer','Identity'),field('description','Description','Identity',{type:'textarea'}),
    field('tracking_mode','Tracking mode','Stock & Units',{type:'select',options:['Serialised','Quantity','Consumable'],createOnly:true}),field('total_quantity','Initial quantity','Stock & Units',{type:'number',createOnly:true}),field('quantity_unit','Quantity unit','Stock & Units',{type:'select',options:['piece','metre','roll','pack']}),field('reorder_level','Reorder level','Stock & Units',{type:'number'}),
    field('purchase_date','Purchase date','Purchase',{type:'date'}),field('purchase_price','Purchase price','Purchase',{type:'money'}),field('replacement_value','Replacement value','Purchase',{type:'money'}),
    ...['daily','weekly','monthly','hourly','weekend'].map(period=>field(`${period}_rate`,`${period[0]?.toUpperCase()}${period.slice(1)} rate`,'Pricing & Rental',{type:'money'})),
    field('deposit_percent','Deposit percent','Pricing & Rental',{type:'number'}),field('deposit_fixed','Fixed deposit','Pricing & Rental',{type:'money'}),field('min_rental_days','Minimum rental days','Pricing & Rental',{type:'number'}),field('rental_enabled','Available for rental','Pricing & Rental',{type:'checkbox'}),
    field('prep_time_minutes','Preparation minutes','Maintenance & Documents',{type:'number'}),field('cleaning_time_minutes','Cleaning minutes','Maintenance & Documents',{type:'number'}),field('inspection_required','Inspection required','Maintenance & Documents',{type:'checkbox'}),field('packing_required','Packing required','Maintenance & Documents',{type:'checkbox'}),field('notes_internal','Internal notes','Maintenance & Documents',{type:'textarea'}),field('notes_warehouse','Warehouse notes','Maintenance & Documents',{type:'textarea'}),
  ],
  bundle: [field('name','Bundle name','Identity',{required:true}),field('description','Description','Identity',{type:'textarea'}),field('category_id','Category','Identity',{type:'select',source:'categories'}),field('daily_rate','Daily rate','Rates',{type:'money'}),field('weekly_rate','Weekly rate','Rates',{type:'money'})],
}
export const recordDefaults: Record<RecordKind, RecordValues> = {
  client:{type_parent:'Organisation',org_subtype:'Production House',country:'Nepal',name:'',phone:''},
  equipment:{name:'',brand:'',tracking_mode:'Serialised',total_quantity:0,quantity_unit:'piece',min_rental_days:1,rental_enabled:true,inspection_required:true,packing_required:true,prep_time_minutes:0,cleaning_time_minutes:0},
  bundle:{name:''},
}
export function validateRecord(kind: RecordKind, values: RecordValues): Record<string,string> {
  const errors: Record<string,string> = {}
  for (const f of recordFields[kind]) {
    const value = values[f.key]
    if(f.required && String(value ?? '').trim() === '') errors[f.key] = `${f.label} is required.`
    if(f.type === 'money' && value !== null && value !== undefined && value !== '' && (parseMoney(String(value)) === null || (parseMoney(String(value)) ?? 0) < 0)) errors[f.key] = 'Enter a non-negative amount.'
    if(f.type === 'number' && value !== null && value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value)<0)) errors[f.key] = 'Enter a non-negative number.'
  }
  if(kind==='client') {
    if(!isValidLocalPhone(String(values.phone ?? '')) && !/^\+977(97|98)\d{8}$/.test(String(values.phone))) errors.phone = 'Enter a 10-digit Nepali mobile starting 97 or 98.'
    if(values.pan_vat && !/^\d{9}$/.test(String(values.pan_vat))) errors.pan_vat = 'PAN/VAT must be exactly nine digits.'
    if(values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) errors.email = 'Enter a valid email address.'
  }
  return errors
}
/** Money is parsed in integer paisa; conversion to database rupees happens once. */
export function recordPayload(kind:RecordKind, values:RecordValues, editing:boolean):RecordValues {
  const result:RecordValues={}
  for(const f of recordFields[kind]) {
    if(editing && f.createOnly) continue
    const v=values[f.key]
    if(v===undefined) continue
    result[f.key]= f.type==='money' ? (v==='' || v===null ? null : toRupees(parseMoney(String(v))!)) : f.type==='number' ? (v==='' || v===null ? null : Number(v)) : typeof v==='string' ? (v.trim() || null) : v
  }
  if(kind==='client') { result.phone=canonicalPhone(String(values.phone)); if(result.type_parent!=='Organisation') result.org_subtype=null }
  return result
}
