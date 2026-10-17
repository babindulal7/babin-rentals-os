/**
 * A table-keyed stand-in for the Supabase client, for the report query tests.
 *
 * Each table answers with fixed rows or a fixed error, whatever the filters —
 * the tests hand each table exactly the rows the read should see. Every call
 * is recorded so a test can assert the filter literal a query sends (e.g.
 * `payments.status = 'Received'`, not the non-enum 'Completed').
 */
export type TableAnswer = readonly Record<string, unknown>[] | { error: string }

export interface FakeCall {
  table: string
  method: string
  args: unknown[]
}

export function fakeSupabase(tables: Record<string, TableAnswer>) {
  const calls: FakeCall[] = []
  const from = (table: string) => {
    const answer = tables[table] ?? []
    const result =
      'error' in answer
        ? { data: null, error: { message: (answer as { error: string }).error } }
        : { data: [...(answer as readonly Record<string, unknown>[])], error: null }
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order', 'limit', 'range']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      }
    }
    builder['then'] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
    return builder
  }
  return { client: { from }, calls }
}
