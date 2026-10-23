import { forwardRef, useId } from 'react'
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
    ...props
  },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  const canDecrease = !disabled && (min === undefined || value > min)
  const canIncrease = !disabled && (max === undefined || value < max)

  const handleDecrease = () => {
    if (!canDecrease) return
    const next = Math.max(min ?? -Infinity, value - step)
    onChange(next)
  }

  const handleIncrease = () => {
    if (!canIncrease) return
    const next = max !== undefined ? Math.min(max, value + step) : value + step
    onChange(next)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === '') return
    const num = Number.parseInt(raw, 10)
    if (Number.isNaN(num)) return
    const clamped = Math.max(min ?? -Infinity, max !== undefined ? Math.min(max, num) : num)
    onChange(clamped)
  }

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
        type="number"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            handleIncrease()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            handleDecrease()
          }
        }}
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
