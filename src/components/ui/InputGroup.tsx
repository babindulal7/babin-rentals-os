import { forwardRef } from 'react'
import type { ComponentProps, MouseEvent } from 'react'
import { cn } from '../../lib/cn'

export type InputGroupAddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end'

export interface InputGroupProps extends ComponentProps<'div'> {
  invalid?: boolean
  disabled?: boolean
}

/**
 * coss-compliant InputGroup container.
 * Groups inline/block addons, prefix/suffix text, and inputs with unified border, focus, and state styling.
 */
export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(function InputGroup(
  { className, invalid = false, disabled = false, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="group"
      data-slot="input-group"
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        'relative inline-flex w-full min-w-0 items-center rounded-[var(--r-input,8px)] border transition-all duration-150',
        invalid
          ? 'border-[var(--danger,#ef4444)] ring-1 ring-[var(--danger,#ef4444)]'
          : 'border-[var(--input-border,var(--border))] focus-within:border-[var(--primary,#386af7)] focus-within:ring-2 focus-within:ring-[var(--primary,#386af7)]/20',
        disabled
          ? 'opacity-60 pointer-events-none bg-[var(--card2,#13233a)]'
          : 'bg-[var(--input-bg,var(--card))]',
        'has-[textarea]:h-auto has-[textarea]:flex-col has-[[data-align=block-start]]:flex-col has-[[data-align=block-end]]:flex-col',
        className
      )}
      style={{
        minHeight: 'var(--tap, 44px)',
        boxShadow: 'var(--shadow-inset, 0 1px 2px rgba(0, 0, 0, 0.05))',
      }}
      {...props}
    >
      {children}
    </div>
  )
})

export interface InputGroupAddonProps extends ComponentProps<'div'> {
  align?: InputGroupAddonAlign
}

/**
 * Addon section inside an InputGroup (icons, currency units, buttons, badges).
 * Clicking a non-interactive addon transfers focus to the child input.
 */
export const InputGroupAddon = forwardRef<HTMLDivElement, InputGroupAddonProps>(function InputGroupAddon(
  { className, align = 'inline-start', onMouseDown, children, ...props },
  ref
) {
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(e)
    const target = e.target as HTMLElement | null
    if (!target) return
    const isInteractive = target.closest('button, a, input, select, textarea, [role="button"]')
    if (isInteractive) return

    e.preventDefault()
    const parent = e.currentTarget.parentElement
    const input = parent?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
    if (input && document.activeElement !== input) {
      input.focus()
    }
  }

  return (
    <div
      ref={ref}
      data-slot="input-group-addon"
      data-align={align}
      onMouseDown={handleMouseDown}
      className={cn(
        'flex select-none items-center justify-center gap-1.5 text-[var(--muted,#9eaabb)] shrink-0',
        align === 'inline-start' && 'order-first ps-3 pe-1',
        align === 'inline-end' && 'order-last pe-3 ps-1',
        align === 'block-start' && 'order-first w-full justify-start px-3 pt-2 pb-1 border-b border-[var(--border)]',
        align === 'block-end' && 'order-last w-full justify-between items-center px-3 py-2 border-t border-[var(--border)] bg-[var(--card2)]/50',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})

export type InputGroupTextProps = ComponentProps<'span'>

/**
 * Text addon (e.g. "Rs.", "NPR", ".com", etc.).
 */
export const InputGroupText = forwardRef<HTMLSpanElement, InputGroupTextProps>(function InputGroupText(
  { className, children, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      data-slot="input-group-text"
      className={cn(
        'flex items-center text-[var(--t-meta,13px)] font-medium text-[var(--text2,#b8c4d3)] pointer-events-none font-mono',
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
})

export type InputGroupInputProps = ComponentProps<'input'>

/**
 * Unstyled input control designed to seamlessly expand within an InputGroup.
 */
export const InputGroupInput = forwardRef<HTMLInputElement, InputGroupInputProps>(function InputGroupInput(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      data-slot="input-group-input"
      className={cn(
        'flex-1 min-w-0 bg-transparent px-3 py-2 text-[var(--t-ui,15px)] text-[var(--text,#f1f5f9)] placeholder:text-[var(--muted,#9eaabb)] outline-none border-none focus:ring-0',
        'disabled:cursor-not-allowed',
        className
      )}
      style={{
        height: '100%',
        minHeight: 'var(--tap, 44px)',
      }}
      {...props}
    />
  )
})

export type InputGroupTextareaProps = ComponentProps<'textarea'>

/**
 * Unstyled textarea control designed for InputGroup block layouts.
 */
export const InputGroupTextarea = forwardRef<HTMLTextAreaElement, InputGroupTextareaProps>(function InputGroupTextarea(
  { className, rows = 3, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      data-slot="input-group-textarea"
      className={cn(
        'w-full min-w-0 bg-transparent px-3 py-2 text-[var(--t-ui,15px)] text-[var(--text,#f1f5f9)] placeholder:text-[var(--muted,#9eaabb)] outline-none border-none focus:ring-0 resize-y',
        'disabled:cursor-not-allowed font-mono text-sm leading-relaxed',
        className
      )}
      {...props}
    />
  )
})
