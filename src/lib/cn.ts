/**
 * Utility for combining Tailwind CSS class names cleanly without external dependencies.
 */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean | null | undefined>
  | ClassValue[]

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = []

  const process = (item: ClassValue): void => {
    if (!item) return
    if (typeof item === 'string' || typeof item === 'number') {
      classes.push(String(item))
    } else if (Array.isArray(item)) {
      for (const sub of item) process(sub)
    } else if (typeof item === 'object') {
      for (const [key, value] of Object.entries(item)) {
        if (value) classes.push(key)
      }
    }
  }

  for (const input of inputs) {
    process(input)
  }

  return classes.join(' ')
}
