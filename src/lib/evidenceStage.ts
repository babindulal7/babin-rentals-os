import type { Database } from '../types/supabase'

type EvidenceCategory = Database['public']['Enums']['evidence_category']
type EvidenceOperationStage = Database['public']['Enums']['evidence_operation_stage']

/** Categories are not stages. Never silently attach unrelated photos to Packing. */
export function evidenceStageForCategory(
  category: EvidenceCategory,
  deliveryType: string | null,
): EvidenceOperationStage {
  switch (category) {
    case 'Packing': return 'Packing'
    case 'Pickup / Delivery':
      if (deliveryType === 'Client Pickup' || deliveryType === 'Customer Pickup' || deliveryType === 'Third Party') return 'Pickup'
      if (deliveryType === 'Babin Delivery' || deliveryType === 'Courier') return 'Delivery'
      throw new Error('Booking delivery method could not be verified. Photo was not saved.')
    case 'Return': return 'Return'
    case 'Inspection': return 'Inspection'
    case 'Damage': return 'Damage'
    case 'Cleaning': return 'Cleaning'
    case 'Maintenance': return 'Maintenance'
    case 'Warehouse': return 'Warehouse'
    case 'Client Documents': return 'Client documents'
    case 'Marketing':
    case 'Others':
      // No matching evidence_operation_stage enum member: do not fabricate one.
      throw new Error(`${category} evidence cannot be uploaded yet: no matching operation stage. Photo was not saved.`)
  }
}
