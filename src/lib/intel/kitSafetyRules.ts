/**
 * kitSafetyRules.ts — Deterministic Kit Compatibility, Model Boundary,
 * Monsoon Mode, and Double-Billing Guardrails (synced from rentals-intelligence).
 */

export interface KitCheckResult {
  isValid: boolean;
  blockingErrors: string[];
  warnings: string[];
  requiredAdditions: string[];
}

/** Match a model token with alphanumeric boundaries (prevents FX3 matching FX30, or 'pl' matching 'baseplate'). */
export function hasModelToken(text: string, pattern: string): boolean {
  const regex = new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`, 'i');
  return regex.test(text);
}

/** Nepal Monsoon Mode: June 1 – September 30 (Ashadh – Ashwin). */
export function isMonsoonMode(targetDateIso?: string): boolean {
  const dt = targetDateIso ? new Date(targetDateIso) : new Date();
  if (Number.isNaN(dt.getTime())) return false;
  const month = dt.getUTCMonth() + 1;
  return month >= 6 && month <= 9;
}

/** Deterministic kit compatibility & hard-conflict checks. */
export function checkKitCompatibility(items: string[]): KitCheckResult {
  const joined = items.join(' ');
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  const requiredAdditions: string[] = [];

  if (hasModelToken(joined, 'ronin\\s*4d') && hasModelToken(joined, 'rs\\s*3|rs\\s*4|rs\\s*5|gimbal|crane|steadicam')) {
    blockingErrors.push('HARD BLOCK: DJI Ronin 4D has an integrated 4-axis gimbal; external gimbal is prohibited.');
  }

  if (hasModelToken(joined, 'chiopt') && !hasModelToken(joined, 'rods?|lens\\s*support|support\\s*bracket|baseplate')) {
    blockingErrors.push('HARD BLOCK: CHIOPT cinema zoom requires 15mm rods and a lens support bracket.');
    requiredAdditions.push('15mm Rods & Lens Support Bracket');
  }

  if (
    hasModelToken(joined, 'glimmer|black\\s*pro\\s*mist|promist') &&
    hasModelToken(joined, '95mm') &&
    !hasModelToken(joined, 'mirage|matte\\s*box|mattebox')
  ) {
    blockingErrors.push('HARD BLOCK: 95mm circular cine filters require Tilta Mirage or compatible matte box.');
    requiredAdditions.push('Tilta Mirage Matte Box');
  }

  if (hasModelToken(joined, 'komodo[\\s\\-_]*x') && hasModelToken(joined, 'cfast')) {
    blockingErrors.push('HARD BLOCK: RED Komodo-X uses CFexpress Type B only; CFast 2.0 is incompatible.');
  }

  if (
    hasModelToken(joined, 'komodo(?:\\s*6k)?') &&
    !hasModelToken(joined, 'komodo[\\s\\-_]*x') &&
    hasModelToken(joined, 'cfexpress')
  ) {
    blockingErrors.push('HARD BLOCK: RED Komodo 6K (Gen 1) uses CFast 2.0 only; CFexpress cards do not fit.');
  }

  if (
    hasModelToken(joined, 'pl\\s*lens|athena|mantis|great\\s*joy|chiopt') &&
    hasModelToken(joined, 'fx3a?|a7s?\\s*(?:iii|iv|v|3|4|5)|e\\s*mount') &&
    !hasModelToken(joined, 'pl[\\s\\-_]*to[\\s\\-_]*e|mount\\s*adapter|adapter')
  ) {
    requiredAdditions.push('PL-to-E Mount Adapter');
  }

  if (hasModelToken(joined, 'fx\\s*30')) {
    warnings.push('BOUNDARY CHECK: Sony FX30 is APS-C/Super35 (distinct from Full-Frame Sony FX3).');
  }

  return {
    isValid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    requiredAdditions,
  };
}

/** §5.3 Child-vs-Line double-billing prevention. */
export function checkDoubleBilling(
  lineProductIds: string[],
  includedInParents: Record<string, string[]>,
): string[] {
  const idSet = new Set(lineProductIds);
  const errors: string[] = [];
  for (const id of lineProductIds) {
    const parents = includedInParents[id] ?? [];
    const overlap = parents.filter((p) => idSet.has(p));
    if (overlap.length > 0) {
      errors.push(`DOUBLE-BILLING CONFLICT (§5.3): ${id} is already included as a mandatory child of ${overlap.join(', ')}.`);
    }
  }
  return errors;
}
