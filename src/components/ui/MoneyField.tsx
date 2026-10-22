import React, { useId } from 'react'
import type { Role } from '../../lib/rbac'
import { canViewMoney } from '../../lib/rbac'
import { toRupees, rupees, type Paisa } from '../../lib/money'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from './InputGroup'

export interface MoneyFieldProps {
  label?: string
  value: Paisa
  onChange?: (paisa: Paisa) => void
  role: Role
  error?: string | null
  helperText?: string
  disabled?: boolean
  className?: string
  id?: string
}

export const MoneyField: React.FC<MoneyFieldProps> = ({
  label,
  value,
  onChange,
  role,
  error,
  helperText,
  disabled = false,
  className = '',
  id,
}) => {
  const generatedId = useId()
  const fieldId = id || generatedId

  // Law 6: Warehouse sees no money
  if (!canViewMoney(role)) {
    return null
  }

  const rupeeValue = toRupees(value)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return
    const num = parseFloat(e.target.value) || 0
    onChange(rupees(num))
  }

  return (
    <div className={className || undefined} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          htmlFor={fieldId}
          style={{
            fontSize: 'var(--t-th)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--muted)',
          }}
        >
          {label}
        </label>
      )}

      <InputGroup invalid={Boolean(error)} disabled={disabled}>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Rs.</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={fieldId}
          aria-label={label || 'Amount in Rupees'}
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={rupeeValue === 0 ? '' : rupeeValue}
          placeholder="0"
          onChange={handleInputChange}
          disabled={disabled}
          style={{
            fontFamily: 'var(--font-id, sans-serif)',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <InputGroupAddon align="inline-end">
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, userSelect: 'none' }}>NPR</span>
        </InputGroupAddon>
      </InputGroup>

      {error && (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
          {error}
        </span>
      )}

      {!error && helperText && (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {helperText}
        </span>
      )}
    </div>
  )
}
