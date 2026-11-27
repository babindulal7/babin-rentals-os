/**
 * Shared typed boundary helpers for Supabase query modules.
 *
 * `src/lib/supabase.ts` creates an untyped `createClient(...)` so the mock
 * corpus proxy and live client share one interface. These helpers narrow the
 * untyped `data` / `{ data, error, count }` query results to explicit row
 * interfaces at the query boundary without `as unknown as` chains.
 */

export interface QueryListResult<TRow> {
  data: TRow[] | null
  error: { message: string; code?: string } | null
  count: number | null
}

export function castRows<TRow>(data: unknown): TRow[] {
  return (data ?? []) as TRow[]
}

export function castRow<TRow>(data: unknown): TRow {
  return data as TRow
}

export function castNullableRow<TRow>(data: unknown): TRow | null {
  return (data ?? null) as TRow | null
}
