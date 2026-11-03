import { forwardRef, useId, useState } from 'react'
import type { ComponentProps } from 'react'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from './InputGroup'
import Icon from './Icon'
import { cn } from '../../lib/cn'

export interface QuantityStepperProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  ariaLabel?: string
  className?: string
}

/**
 * Coss-styled Quantity Stepper built on InputGroup.
 * Complies with Law 15 (touch targets >= 44px) and provides keyboard increment/decrement.
 *
 * ## Typed Input Ergonomics
 * - Supports clearing the field to type a replacement (e.g. replacing 5 with 12).
 * - Separates internal editing text from committed numeric value while focused.
 * - Validates and clamps to [min, max] on blur, Enter, or stepper button clicks.
 * - Supports integer and fractional step contracts without truncation.
 */
export const QuantityStepper = forwardRef<HTMLInputElement, QuantityStepperProps>(function QuantityStepper(
  {
    value,
    onChange,
    min = 0,
    max,
    step = 1,
    unit,
    ariaLabel = 'Quantity',
    disabled = false,
    className,
    id,
    onBlur,
    onKeyDown,
    ...props
  },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [editingText, setEditingText] = useState<string | null>(null)

  const isDecimal = step !== undefined && step % 1 !== 0

  const canDecrease = !disabled && (min === undefined || value > min)
  const canIncrease = !disabled && (max === undefined || value < max)

  const parseAndClamp = (raw: string): number => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      return min !== undefined ? min : (Number.isFinite(value) ? value : 0)
    }
    const num = isDecimal || trimmed.includes('.')
      ? Number.parseFloat(trimmed)
      : Number.parseInt(trimmed, 10)

    if (Number.isNaN(num) || !Number.isFinite(num)) {
      return value
    }

    let clamped = num
    if (min !== undefined && clamped < min) clamped = min
    if (max !== undefined && clamped > max) clamped = max

    if (isDecimal && step > 0) {
      const precision = (String(step).split('.')[1] || '').length
      clamped = Number(clamped.toFixed(precision))
    }
    return clamped
  }

  const commitValue = (raw: string) => {
    const next = parseAndClamp(raw)
    onChange(next)
    setEditingText(null)
    return next
  }

  const handleDecrease = () => {
    if (disabled) return
    const current = editingText !== null ? parseAndClamp(editingText) : value
    const next = Math.max(min ?? -Infinity, current - step)
    const finalVal = isDecimal && step > 0
      ? Number(next.toFixed((String(step).split('.')[1] || '').length))
      : next
    onChange(finalVal)
    setEditingText(null)
  }

  const handleIncrease = () => {
    if (disabled) return
    const current = editingText !== null ? parseAndClamp(editingText) : value
    const next = max !== undefined ? Math.min(max, current + step) : current + step
    const finalVal = isDecimal && step > 0
      ? Number(next.toFixed((String(step).split('.')[1] || '').length))
      : next
    onChange(finalVal)
    setEditingText(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Allow intermediate typing (empty string, minus sign, decimal point)
    setEditingText(raw)

    // If it is already a valid finite number, inform parent live if within bounds,
    // but without prematurely clamping characters while the user is actively typing.
    const num = isDecimal || raw.includes('.')
      ? Number.parseFloat(raw)
      : Number.parseInt(raw, 10)

    if (!Number.isNaN(num) && Number.isFinite(num)) {
      const withinMin = min === undefined || num >= min
      const withinMax = max === undefined || num <= max
      if (withinMin && withinMax) {
        onChange(num)
      }
    }
  }

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (editingText !== null) {
      commitValue(editingText)
    }
    onBlur?.(e)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME Enter selects a character; it must not commit the quantity or step it.
    // keyCode 229 covers older mobile/desktop composition implementations.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter') {
      if (editingText !== null) {
        commitValue(editingText)
      }
    } else if (e.key === 'Escape') {
      setEditingText(null)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      handleIncrease()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      handleDecrease()
    }
    onKeyDown?.(e)
  }

  const displayValue = editingText !== null ? editingText : String(value)

  return (
    <InputGroup className={cn('w-full max-w-[200px]', className)} disabled={disabled}>
      <InputGroupAddon align="inline-start" className="p-0">
        <button
          type="button"
          aria-label={`Decrease ${ariaLabel}`}
          disabled={!canDecrease}
          onClick={handleDecrease}
          className={cn(
            'min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--muted)]',
            'hover:text-[var(--text)] hover:bg-[var(--card2)] transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
          )}
        >
          <Icon name="minus" size={16} />
        </button>
      </InputGroupAddon>

      <InputGroupInput
        ref={ref}
        id={inputId}
        type="text"
        inputMode={isDecimal ? 'decimal' : 'numeric'}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={ariaLabel}
        value={displayValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        disabled={disabled}
        className="text-center font-mono font-semibold tabular-nums px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        {...props}
      />

      {unit && (
        <InputGroupAddon className="px-2">
          <InputGroupText className="text-[11px] font-medium text-[var(--muted)] select-none">
            {unit}
          </InputGroupText>
        </InputGroupAddon>
      )}

      <InputGroupAddon align="inline-end" className="p-0">
        <button
          type="button"
          aria-label={`Increase ${ariaLabel}`}
          disabled={!canIncrease}
          onClick={handleIncrease}
          className={cn(
            'min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--muted)]',
            'hover:text-[var(--text)] hover:bg-[var(--card2)] transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
          )}
        >
          <Icon name="plus" size={16} />
        </button>
      </InputGroupAddon>
    </InputGroup>
  )
})

QuantityStepper.displayName = 'QuantityStepper'
