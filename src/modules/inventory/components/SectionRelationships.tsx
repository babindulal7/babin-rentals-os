import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Page'
import { Field, SectionCard, inputStyle, fieldRow, Chip } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { CONTAINER_MODELS, ATTACHABLE_MODELS, modelName, CONTAINER_CAPACITY_REASON } from '../../../lib/queries/addEquipment'

export function SectionRelationships() {
  const {
    category,
    brand,
    storedIn,
    setStoredIn,
    contains,
    setContains,
    containPick,
    setContainPick,
    compatible,
    setCompatible,
    compatiblePick,
    setCompatiblePick,
    requires,
    setRequires,
    requiresPick,
    setRequiresPick,
    familyId,
    familyName,
    setFamilyName,
    optionDimension,
    setOptionDimension,
    optionLabel,
    setOptionLabel,
    ungroupFamily,
    suggestions,
    usedInBundles,
    addContained,
    errors,
    sectionNumber,
  } = useEquipmentContext()

  return (
    <SectionCard
            id="sec-relationships"
            n={sectionNumber('sec-relationships')}
            title="Relationships"
          >
            {errors.relationships && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {errors.relationships}
              </span>
            )}

            {/* §6.1 — containment, physical, one parent. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Containment — one container at a time</strong>
              <div style={fieldRow}>
                <Field label="Stored In">
                  <select
                    value={storedIn}
                    onChange={(e) => {
                      setStoredIn(e.target.value)
                    }}
                    style={inputStyle(Boolean(errors.relationships))}
                  >
                    <option value="">None — direct shelf</option>
                    {CONTAINER_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.sku})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Contains">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={containPick} onChange={(e) => setContainPick(e.target.value)} style={inputStyle()}>
                      <option value="">Select an item to attach</option>
                      {ATTACHABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        addContained(containPick)
                        setContainPick('')
                      }}
                    >
                      Attach
                    </Button>
                  </div>
                </Field>
              </div>

              {contains.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contains.map((c) => (
                    <div
                      key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 7, background: 'var(--card2)', border: '1px solid var(--border)' }}
                    >
                      <Icon name="package" size={14} style={{ color: 'var(--link)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{modelName(c.modelId)}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={c.quantity}
                          onChange={(e) =>
                            setContains((prev) => prev.map((x) => (x.id === c.id ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))
                          }
                          className="figure"
                          /* Law 15 — the `height: 28` override defeated inputStyle's
                             `minHeight: 44` touch floor on the one control in this row
                             that takes typing. Width stays 62: the floor is 44 and a
                             quantity is at most a few digits. */
                          style={{ ...inputStyle(), width: 62 }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setContains((prev) => prev.filter((x) => x.id !== c.id))}
                        aria-label={`Detach ${modelName(c.modelId)}`}
                        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  ))}
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                    {/* Detaching removes only the relationship — the child stays an independent asset (§6.1). */}Detaching removes only the relationship — the child stays an independent asset. </span>
                </div>
              )}

              {/* §7 — auto-suggested children from what comparable units contain. */}
              {suggestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                    Suggested from what other {category || brand} units contain — click to attach:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => addContained(s.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 9px',
                          borderRadius: 'var(--r-badge)',
                          border: '1px dashed var(--border2)',
                          background: 'transparent',
                          color: 'var(--link)',
                          fontSize: 'var(--t-meta)',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="plus" size={11} />
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
                <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                {CONTAINER_CAPACITY_REASON}
              </span>
            </div>

            {/* §6.2 — kit membership, read-only. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Kit membership — read-only here</strong>
              {usedInBundles.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {usedInBundles.map((b) => (
                    <Chip key={b} icon="queues">
                      {b}
                    </Chip>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  Not used in any bundle. Bundles are built in Inventory ▸ Bundles; this panel only shows where the item is
                  already used, so a retirement’s blast radius is visible.
                </span>
              )}
            </div>

            {/* §6.3 — compatibility, informational, many-to-many. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
              <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Compatibility — never affects availability or price</strong>
              <div style={fieldRow}>
                <Field label="Compatible with">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={compatiblePick} onChange={(e) => setCompatiblePick(e.target.value)} style={inputStyle()}>
                      <option value="">Select an item</option>
                      {ATTACHABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (compatiblePick && !compatible.includes(compatiblePick)) setCompatible((prev) => [...prev, compatiblePick])
                        setCompatiblePick('')
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </Field>
                <Field label="Requires">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={requiresPick} onChange={(e) => setRequiresPick(e.target.value)} style={inputStyle()}>
                      <option value="">Select an item</option>
                      {ATTACHABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (requiresPick && !requires.includes(requiresPick)) setRequires((prev) => [...prev, requiresPick])
                        setRequiresPick('')
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </Field>
              </div>

              {(compatible.length > 0 || requires.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                  {compatible.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', width: 74 }}>Compatible</span>
                      {compatible.map((id) => (
                        <Chip key={id} icon="external_link" onRemove={() => setCompatible((prev) => prev.filter((x) => x !== id))}>
                          {modelName(id)}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {requires.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', width: 74 }}>Requires</span>
                      {requires.map((id) => (
                        <Chip key={id} icon="plug" onRemove={() => setRequires((prev) => prev.filter((x) => x !== id))}>
                          {modelName(id)}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Product Family & Options (T7-13, B2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                  Product Family & Options (Option Picker)
                </strong>
                {(familyId || familyName) && (
                  <Button variant="secondary" onClick={ungroupFamily} style={{ minHeight: 44 }}>
                    Ungroup from Family
                  </Button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.4 }}>
                Products differing only by an option (mount, length, size) show as one item on the online store and catalogue with an option picker, while retaining individual stock and reservations (B2, T7-13).
              </p>

              <div style={fieldRow}>
                <Field label="Family Name">
                  <input
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="e.g. DZOFilm Vespid Prime Lenses"
                    style={inputStyle()}
                  />
                </Field>
                <Field label="Option Dimension">
                  <select
                    value={optionDimension}
                    onChange={(e) => setOptionDimension(e.target.value)}
                    style={inputStyle()}
                  >
                    <option value="Mount">Mount (EF / PL / E)</option>
                    <option value="Length">Length (Cable / Track)</option>
                    <option value="Size">Size (S / M / L)</option>
                    <option value="Color">Color</option>
                  </select>
                </Field>
                <Field label="Option Label for this Equipment">
                  <input
                    value={optionLabel}
                    onChange={(e) => setOptionLabel(e.target.value)}
                    placeholder="e.g. PL Mount, 15m, Large"
                    style={inputStyle()}
                  />
                </Field>
              </div>

              {(familyId || familyName) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <Icon name="tag" size={14} style={{ color: 'var(--accent-gold, #facc15)' }} />
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    Grouped in family: <strong>{familyName || 'Linked Family'}</strong> · Option: <strong>{optionLabel || 'Default'}</strong> ({optionDimension})
                  </span>
                </div>
              )}
            </div>
          </SectionCard>
  )
}
