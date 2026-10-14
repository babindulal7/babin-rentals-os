/**
 * The one line shown beside a disabled Confirm: the first requirement still unmet and how many
 * follow it. The workspaces already evaluate their own gates; this only words the result so all
 * four stages say it the same way. Returns null when nothing is unmet.
 */
export function nextRequirement(unmet: readonly string[]): string | null {
  const [first, ...rest] = unmet
  if (!first) return null
  return rest.length > 0 ? `${first} (+${rest.length} more)` : first
}
