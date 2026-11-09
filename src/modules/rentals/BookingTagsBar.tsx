import { useState, useRef, useEffect, useCallback } from 'react'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { setBookingTags } from '../../actions/rentals/setBookingTags'
import { useAuth } from '../../lib/auth'

export interface BookingTagsBarProps {
  bookingId: string
  bookingNo: string
  tags: string[]
  canEdit: boolean
  onTagsChanged?: (newTags: string[]) => void
}

const POPULAR_TAGS = ['wedding', 'repeat', 'festival', 'corporate', 'urgent'] as const

export function BookingTagsBar({
  bookingId,
  bookingNo,
  tags,
  canEdit,
  onTagsChanged,
}: BookingTagsBarProps) {
  const { user } = useAuth()
  const [currentTags, setCurrentTags] = useState<string[]>(tags)
  const [isAdding, setIsAdding] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrentTags(tags)
  }, [tags])

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus()
    }
  }, [isAdding])

  // Close popover on outside click
  useEffect(() => {
    if (!isAdding) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsAdding(false)
        setInputVal('')
        setError(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAdding])

  const saveTags = useCallback(
    async (nextTags: string[]) => {
      if (!user) return
      setSaving(true)
      setError(null)
      try {
        const res = await setBookingTags(
          {
            id: bookingId,
            tags: nextTags,
          },
          { userId: user.id, role: user.role },
        )
        const updated = res.tags
        setCurrentTags(updated)
        onTagsChanged?.(updated)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save tags'
        setError(msg)
      } finally {
        setSaving(false)
      }
    },
    [bookingId, user, onTagsChanged],
  )

  const handleAddTag = useCallback(
    async (tagToAdd: string) => {
      const trimmed = tagToAdd.trim()
      if (!trimmed) return
      if (trimmed.length > 30) {
        setError('Tag must be 30 characters or fewer')
        return
      }
      const lower = trimmed.toLowerCase()
      if (currentTags.some((t) => t.toLowerCase() === lower)) {
        setError(`"${trimmed}" is already added`)
        return
      }
      const nextTags = [...currentTags, trimmed]
      await saveTags(nextTags)
      setInputVal('')
      setError(null)
    },
    [currentTags, saveTags],
  )

  const handleRemoveTag = useCallback(
    async (tagToRemove: string) => {
      const nextTags = currentTags.filter(
        (t) => t.toLowerCase() !== tagToRemove.toLowerCase(),
      )
      await saveTags(nextTags)
    },
    [currentTags, saveTags],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag(inputVal)
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setInputVal('')
      setError(null)
    }
  }

  // Quick picks that are not already applied to this booking
  const availableQuickPicks = POPULAR_TAGS.filter(
    (tag) => !currentTags.some((t) => t.toLowerCase() === tag.toLowerCase()),
  )

  return (
    <div
      className="booking-tags-bar"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 'var(--sp-xs, 6px)',
        padding: '8px 14px',
        background: 'var(--card-bg, var(--surface))',
        borderRadius: 'var(--r-card, 8px)',
        border: '1px solid var(--border)',
        minHeight: 44,
      }}
      aria-label={`Tags for booking ${bookingNo}`}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 'var(--t-meta, 12px)',
          fontWeight: 600,
          color: 'var(--text2)',
          marginRight: 4,
          userSelect: 'none',
        }}
      >
        <Icon name="tag" size={14} />
        <span>Tags:</span>
      </div>

      {currentTags.length === 0 && !canEdit && (
        <span style={{ fontSize: 'var(--t-meta, 12px)', color: 'var(--muted)', fontStyle: 'italic' }}>
          No tags
        </span>
      )}

      {currentTags.map((tag) => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px 3px 10px',
            borderRadius: 'var(--r-full, 9999px)',
            background: 'var(--active-row, rgba(59, 130, 246, 0.1))',
            border: '1px solid var(--primary, #3b82f6)',
            color: 'var(--text, #f8fafc)',
            fontSize: 'var(--t-meta, 12px)',
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          <span>#{tag}</span>
          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleRemoveTag(tag)}
              aria-label={`Remove tag ${tag}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                cursor: 'pointer',
                padding: 0,
                marginLeft: 2,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--danger-text, #ef4444)'
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text2)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </span>
      ))}

      {canEdit && (
        <div style={{ position: 'relative', display: 'inline-block' }} ref={popoverRef}>
          {!isAdding ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                setIsAdding(true)
                setError(null)
              }}
              aria-label="Add tag"
              style={{
                height: 28,
                padding: '0 8px',
                fontSize: 'var(--t-meta, 12px)',
                borderRadius: 'var(--r-full, 9999px)',
                gap: 4,
                minWidth: 44,
                minHeight: 28,
              }}
            >
              <Icon name="plus" size={12} />
              <span>Tag</span>
            </Button>
          ) : (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 40,
                background: 'var(--card, #1e293b)',
                border: '1px solid var(--border, #334155)',
                borderRadius: 'var(--r-card, 8px)',
                boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.3))',
                padding: '10px 12px',
                width: 260,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={30}
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value)
                    if (error) setError(null)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="New tag (max 30 chars)..."
                  aria-label="New tag name"
                  style={{
                    flex: 1,
                    height: 32,
                    padding: '0 8px',
                    borderRadius: 'var(--r-sm, 4px)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface, #0f172a)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta, 12px)',
                    outline: 'none',
                  }}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={saving || !inputVal.trim()}
                  onClick={() => handleAddTag(inputVal)}
                  style={{ height: 32, padding: '0 10px', fontSize: 'var(--t-meta, 12px)' }}
                >
                  Add
                </Button>
              </div>

              {availableQuickPicks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>
                    Quick pick:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {availableQuickPicks.map((pick) => (
                      <button
                        key={pick}
                        type="button"
                        disabled={saving}
                        onClick={() => handleAddTag(pick)}
                        style={{
                          background: 'var(--surface, #0f172a)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-full, 9999px)',
                          padding: '2px 8px',
                          fontSize: '11px',
                          color: 'var(--text)',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)'
                        }}
                      >
                        +{pick}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    fontSize: '11px',
                    color: 'var(--danger-text, #ef4444)',
                    background: 'var(--st-danger-bg, rgba(239, 68, 68, 0.1))',
                    padding: '4px 6px',
                    borderRadius: 4,
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && !isAdding && (
        <span
          role="alert"
          style={{
            fontSize: 'var(--t-meta, 12px)',
            color: 'var(--danger-text, #ef4444)',
            marginLeft: 8,
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
