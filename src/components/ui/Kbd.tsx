import { forwardRef } from 'react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps extends ComponentProps<'kbd'> {
  size?: 'sm' | 'md'
}

/**
 * coss-style Kbd badge for keyboard shortcuts and accelerators.
 */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { className, size = 'md', children, ...props },
  ref
) {
  return (
    <kbd
      ref={ref}
      data-slot="kbd"
      className={cn(
        'inline-flex items-center justify-center font-mono font-semibold uppercase tracking-wider',
        size === 'sm' ? 'text-[9px] px-1 py-0.2 min-w-[16px] h-4 rounded-[3px]' : 'text-[10px] px-1.5 py-0.5 min-w-[20px] h-5 rounded-[var(--r-xs,4px)]',
        'border border-[var(--border)] bg-[var(--card2,#13233a)] text-[var(--muted,#9eaabb)] shadow-xs select-none',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  )
})
