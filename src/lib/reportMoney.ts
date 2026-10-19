import { parseMoney, type Paisa } from './money'

/** Decode recorded SQL numeric amounts once, before any report arithmetic. */
export function databaseMoney(value: unknown): Paisa {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      !/^-?\d+(?:\.\d+)?$/.test(String(value))) {
    throw new Error('A recorded financial amount is missing or invalid.')
  }
  const amount = parseMoney(String(value))
  if (amount === null || !Number.isSafeInteger(amount)) {
    throw new Error('A recorded financial amount exceeds exact report precision.')
  }
  return amount
}

/** Integer-paisa totals may never silently overflow JavaScript's exact range. */
export function reportPaisa(value: number): Paisa {
  if (!Number.isSafeInteger(value)) throw new Error('Report total exceeds exact financial precision.')
  return value as Paisa
}
