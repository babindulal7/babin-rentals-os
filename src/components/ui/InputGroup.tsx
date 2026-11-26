import { Children, forwardRef, isValidElement } from 'react'
import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type InputGroupAddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end'

export interface InputGroupProps extends ComponentProps<'div'> {
  invalid?: boolean
  disabled?: boolean
}

/**
 * coss-compliant InputGroup container.
 * Groups inline/block addons, prefix/suffix text, and inputs with unified border, focus, and state styling.
 *
 * Rewritten from Tailwind utility classes — `relative inline-flex w-full ... border
 * ...` — to the app's real inline-style + CSS-variable system, following the same
 * precedent as Button/Modal/Toast/cossDialog: Tailwind's Vite plugin is
 * registered but no CSS file in the ops bundle imports `tailwindcss`, so those
 * classes compiled to nothing and every live InputGroup (MoneyField,
 * ConfirmDialog's reason gate, equipmentAssist) rendered as a borderless
 * block. Component API is unchanged: `invalid`, `disabled`, `align`,
 * data-slot attributes, and the addon focus-transfer behavior all keep their
 * contracts. Only the `:focus-within`/`[data-invalid]` rings live in
 * ui-v2.css — inline styles cannot express them, and the operations-table
 * focus-within pattern is the established token-reading home for exactly this.
 */

/** True when a direct child is the textarea part (or a bare <textarea>). */
function childIsTextarea(child: ReactNode): boolean {
  return isValidElement(child) && (child.type === InputGroupTextarea || child.type === 'textarea')
}

/** True when a direct child is an addon pinned to a block edge. */
function childIsBlockAddon(child: ReactNode): boolean {
  if (!isValidElement(child)) return false
  const align = (child.props as { align?: InputGroupAddonAlign }).align
  return align === 'block-start' || align === 'block-end'
}

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(function InputGroup(
  { className, invalid = false, disabled = false, children, style, ...props },
  ref
) {
  const childrenArray = Children.toArray(children)
  /* Detect textareas and block-aligned addons directly rather than depending
     on CSS relational selectors for the layout. */
  const isBlockLayout =
    childrenArray.some(childIsTextarea) || childrenArray.some(childIsBlockAddon)

  return (
    <div
      ref={ref}
      role="group"
      data-slot="input-group"
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cn(className)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: isBlockLayout ? 'column' : 'row',
        alignItems: isBlockLayout ? 'stretch' : 'center',
        width: '100%',
        minWidth: 0,
        minHeight: 'var(--tap, 44px)',
        borderRadius: 'var(--r-input, 8px)',
        border: `1px solid ${invalid ? 'var(--danger)' : 'var(--input-border, var(--border))'}`,
        background: disabled ? 'var(--surface-inset, var(--card2))' : 'var(--input-bg, var(--card))',
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? 'none' : undefined,
        boxShadow: 'var(--shadow-inset, 0 1px 2px rgba(0, 0, 0, 0.05))',
        ...style,
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
  { className, align = 'inline-start', onMouseDown, children, style, ...props },
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

  /* Base padding/order per alignment; the visual position comes from flex
     order, matching the dead `order-first`/`order-last` utility intent. The
     input itself carries order 0, so -1 lands before it and 10 after. */
  const alignStyle: Record<InputGroupAddonAlign, ComponentProps<'div'>['style']> = {
    'inline-start': { order: -1, paddingInlineStart: 12, paddingInlineEnd: 4 },
    'inline-end': { order: 10, paddingInlineStart: 4, paddingInlineEnd: 12 },
    'block-start': {
      order: -1,
      width: '100%',
      justifyContent: 'flex-start',
      padding: '8px 12px 6px',
      borderBottom: '1px solid var(--border)',
    },
    'block-end': {
      order: 10,
      width: '100%',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface-inset, var(--card2))',
    },
  }

  return (
    <div
      ref={ref}
      role="presentation"
      data-slot="input-group-addon"
      data-align={align}
      /* Pointer-only affordance: clicking the padding/icon focuses the sibling
         input. Keyboard users reach that input directly, and a nested real
         button keeps its own semantics — so the wrapper stays presentational
         rather than a focusable role="button" that can do nothing on Enter. */
      onMouseDown={handleMouseDown}
      className={cn(className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        gap: 6,
        userSelect: 'none',
        color: 'var(--muted)',
        ...alignStyle[align],
        ...style,
      }}
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
  { className, children, style, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      data-slot="input-group-text"
      className={cn(className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: 'var(--t-meta, 13px)',
        fontWeight: 500,
        color: 'var(--text2)',
        pointerEvents: 'none',
        fontFamily: 'var(--font-num, monospace)',
        ...style,
      }}
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
  { className, style, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      data-slot="input-group-input"
      className={cn(className)}
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        minHeight: 'var(--tap, 44px)',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: '8px 12px',
        fontSize: 'var(--t-ui, 15px)',
        color: 'var(--text)',
        fontFamily: 'inherit',
        ...style,
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
  { className, rows = 3, style, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      data-slot="input-group-textarea"
      className={cn(className)}
      style={{
        width: '100%',
        minWidth: 0,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: '10px 12px',
        fontSize: 'var(--t-ui, 15px)',
        color: 'var(--text)',
        fontFamily: 'inherit',
        lineHeight: 1.6,
        resize: 'vertical',
        ...style,
      }}
      {...props}
    />
  )
})
