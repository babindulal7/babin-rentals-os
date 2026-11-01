import fs from 'fs'

function writeSafe(path, content) {
  fs.writeFileSync(path + '.tmp', content)
  fs.renameSync(path + '.tmp', path)
}

// 1. Fix src/actions/deliveryZones/__tests__/*.test.ts
const testFiles = [
  'createDeliveryZone.test.ts',
  'deactivateDeliveryZone.test.ts',
  'getDeliveryZoneFee.test.ts',
  'listDeliveryZones.test.ts',
  'updateDeliveryZone.test.ts',
]

for (const tf of testFiles) {
  const p = 'src/actions/deliveryZones/__tests__/' + tf
  if (!fs.existsSync(p)) continue
  let c = fs.readFileSync(p, 'utf8')
  c = c.replace(/..\/..\/..\/..\/lib\/supabase/g, '../../../lib/supabase')
  c = c.replace(/..\/..\/..\/..\/events\/eventBus/g, '../../../events/eventBus')
  c = c.replace("import { ActionPermissionError } from '../../core';", "// import { ActionPermissionError } from '../../core';")
  c = c.replace("const coordinatorContext = { role: 'Coordinator' as const };", "")
  c = c.replace("const clientContext = { role: 'Client' as const };", "")
  writeSafe(p, c)
  console.log('Fixed', p)
}

// 2. Fix src/actions/deliveryZones/*.ts
const actionFiles = [
  'createDeliveryZone.ts',
  'deactivateDeliveryZone.ts',
  'updateDeliveryZone.ts',
]
for (const af of actionFiles) {
  const p = 'src/actions/deliveryZones/' + af
  if (!fs.existsSync(p)) continue
  let c = fs.readFileSync(p, 'utf8')
  c = c.replace("import { DomainEvents } from '../../events/eventBus';", "// import { DomainEvents } from '../../events/eventBus';")
  writeSafe(p, c)
  console.log('Fixed', p)
}

// Fix getDeliveryZoneFee.ts and listDeliveryZones.ts
const pFee = 'src/actions/deliveryZones/getDeliveryZoneFee.ts'
if (fs.existsSync(pFee)) {
  let c = fs.readFileSync(pFee, 'utf8')
  c = c.replace("execute: async (input, ctx) => {", "execute: async (input, _ctx) => {")
  writeSafe(pFee, c)
  console.log('Fixed', pFee)
}

const pList = 'src/actions/deliveryZones/listDeliveryZones.ts'
if (fs.existsSync(pList)) {
  let c = fs.readFileSync(pList, 'utf8')
  c = c.replace("execute: async (input, ctx) => {", "execute: async (input, _ctx) => {")
  writeSafe(pList, c)
  console.log('Fixed', pList)
}

// 3. Fix DeliverySection.tsx
const pDel = 'src/modules/rentals/booking/DeliverySection.tsx'
if (fs.existsSync(pDel)) {
  let c = fs.readFileSync(pDel, 'utf8')
  // import paisa
  if (!c.includes('paisa,')) {
    c = c.replace("import { formatMoney } from '../../../lib/money'", "import { formatMoney, paisa } from '../../../lib/money'")
  }
  // destructuring
  const targetDestruct = `export function DeliverySection({
  open,
  onToggle,
  isPhone,
  clientPickup,`
  const replDestruct = `export function DeliverySection({
  open,
  onToggle,
  isPhone,
  clientPickup: _clientPickupProp,
  deliveryZone = '',
  setDeliveryZone = () => {},
  clientPickup = false,`
  if (c.includes(targetDestruct)) {
    c = c.replace(targetDestruct, replDestruct)
  }

  // setDeliveryChargePaisa(result.feePaisa)
  c = c.replace('setDeliveryChargePaisa(result.feePaisa)', 'setDeliveryChargePaisa(paisa(result.feePaisa))')
  c = c.replace('setDeliveryChargePaisa(numVal * 100)', 'setDeliveryChargePaisa(paisa(numVal * 100))')

  // remove duplicate const clientPickup = deliveryType === 'Client Pickup'
  c = c.replace("const clientPickup = deliveryType === 'Client Pickup'", "const isClientPickup = deliveryType === 'Client Pickup'")
  c = c.replace("summary={clientPickup ?", "summary={isClientPickup ?")
  c = c.replace("{clientPickup ? (", "{isClientPickup ? (")
  c = c.replace("<Badge variant={clientPickup ? 'neutral' : 'info'}>", "<Badge variant={isClientPickup ? 'neutral' : 'info'}>")
  c = c.replace("{clientPickup ? 'Client Pickup' : 'Babin Delivery'}", "{isClientPickup ? 'Client Pickup' : 'Babin Delivery'}")

  writeSafe(pDel, c)
  console.log('Fixed', pDel)
}

// 4. Fix CrewAndTransportSection.test.tsx
const pCrewTest = 'src/modules/rentals/booking/__tests__/CrewAndTransportSection.test.tsx'
if (fs.existsSync(pCrewTest)) {
  let c = fs.readFileSync(pCrewTest, 'utf8')
  if (!c.includes("deliveryZone: ''")) {
    c = c.replace("deliveryType: 'Babin Delivery',", "deliveryType: 'Babin Delivery',\n      deliveryZone: '',")
  }
  writeSafe(pCrewTest, c)
  console.log('Fixed', pCrewTest)
}
