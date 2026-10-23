import { forwardRef } from 'react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps extends ComponentProps<'kbd'> {
  size?: 'sm' | 'md'
}

/**
 * coss-style Kbd badge for keyboard shortcuts and accelerators.
 *
 * Rewritten from Tailwind utility classes to the app's real inline-style +
 * CSS-variable system (same precedent as Button/Modal/Toast/InputGroup: the
 * ops bundle imports no `tailwindcss`, so utility classes compiled to nothing
 * and every live Kbd — SearchInput's shortcut hint, the CommandPalette
 * legend — rendered as a bare browser-default <kbd>). API unchanged.
 */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { className, size = 'md', children, style, ...props },
  ref
) {
  const sizing =
    size === 'sm'
      ? { fontSize: 9, padding: '1px 4px', minWidth: 16, height: 16, borderRadius: 3 }
      : { fontSize: 10, padding: '2px 6px', minWidth: 20, height: 20, borderRadius: 'var(--r-xs, 4px)' }

  return (
    <kbd
      ref={ref}
      data-slot="kbd"
      className={cn(className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-num, monospace)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        lineHeight: 1,
        border: '1px solid var(--border)',
        background: 'var(--card2)',
        color: 'var(--muted)',
        boxShadow: 'var(--shadow-xs)',
        userSelect: 'none',
        ...sizing,
        ...style,
      }}
      {...props}
    >
      {children}
    </kbd>
  )
})
