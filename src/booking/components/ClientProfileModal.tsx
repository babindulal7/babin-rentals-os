/**
 * src/booking/components/ClientProfileModal.tsx
 *
 * Client Portal Profile & KYC Management Modal (T7-03).
 * Allows clients to view/edit contact details and upload ID-on-file documents.
 */

import React, { useState, useEffect } from 'react'
import {
  type ClientUser,
  type OnlineProfile,
  fetchOnlineProfile,
  saveOnlineProfile,
  uploadKycDocument,
  signOutClient,
} from '../lib/clientAuthApi'

interface ClientProfileModalProps {
  isOpen: boolean
  onClose: () => void
  user: ClientUser | null
  onSignOut: () => void
  onProfileUpdated?: ((profile: OnlineProfile) => void) | undefined
}

export const ClientProfileModal: React.FC<ClientProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onSignOut,
  onProfileUpdated,
}) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [profile, setProfile] = useState<OnlineProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [pan, setPan] = useState('')

  // KYC fields
  const [docType, setDocType] = useState('Citizenship')
  const [docNumber, setDocNumber] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    if (!isOpen || !user) return

    let isMounted = true
    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    fetchOnlineProfile()
      .then((data) => {
        if (!isMounted) return
        if (data) {
          setProfile(data)
          setName(data.name || '')
          setPhone(data.phone || '')
          setCompany(data.company || '')
          setPan(data.pan || '')
          if (data.id_doc_type) setDocType(data.id_doc_type)
        } else {
          setName(user.email.split('@')[0] || '')
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return
        const msg = err instanceof Error ? err.message : 'Failed to load profile.'
        setError(msg)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, user])

  if (!isOpen || !user) return null

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!name.trim()) {
      setError('Full name is required.')
      return
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('Valid phone number (minimum 10 digits) is required.')
      return
    }

    setSaving(true)
    try {
      const updated = await saveOnlineProfile({
        name: name.trim(),
        phone: phone.trim(),
        company: company.trim() || undefined,
        pan: pan.trim() || undefined,
        id_doc_type: profile?.id_doc_type || undefined,
        id_doc_number: profile?.id_doc_number || undefined,
        id_doc_path: profile?.id_doc_path || undefined,
      })
      setProfile(updated)
      setSuccessMsg('Profile details saved successfully.')
      onProfileUpdated?.(updated)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleUploadKyc = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!selectedFile) {
      setError('Please choose an identity document file to upload.')
      return
    }
    if (!docNumber.trim()) {
      setError('Please provide the document number for verification.')
      return
    }

    setUploading(true)
    try {
      const { profile: updated } = await uploadKycDocument(selectedFile, docType, docNumber.trim())
      setProfile(updated)
      setSelectedFile(null)
      setDocNumber('')
      setSuccessMsg('Identity document uploaded and verified on file.')
      onProfileUpdated?.(updated)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Document upload failed.'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleSignOut = async () => {
    await signOutClient()
    onSignOut()
    onClose()
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-profile-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-content" style={{ maxWidth: 540, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close client profile modal"
        >
          ×
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 id="client-profile-title" style={{ fontSize: '1.3rem', fontWeight: 800 }}>
              Client Account & KYC
            </h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              color: 'var(--rose-text)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--rose-border)',
              color: 'var(--rose-text)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              color: 'var(--green-text)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 16,
            }}
          >
            ✓ {successMsg}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            Loading profile…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Contact Details Form */}
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-gold)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
                Primary Contact Information
              </h3>

              <div className="form-group">
                <label htmlFor="profile-name-input" className="form-label">
                  Full Name / Production Lead *
                </label>
                <input
                  id="profile-name-input"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Pasang Sherpa"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="profile-phone-input" className="form-label">
                  Mobile Phone Number * (+977)
                </label>
                <input
                  id="profile-phone-input"
                  type="tel"
                  required
                  className="form-input"
                  placeholder="98XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label htmlFor="profile-company-input" className="form-label">
                    Company / Production House
                  </label>
                  <input
                    id="profile-company-input"
                    type="text"
                    className="form-input"
                    placeholder="Optional"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="profile-pan-input" className="form-label">
                    PAN Number
                  </label>
                  <input
                    id="profile-pan-input"
                    type="text"
                    className="form-input"
                    placeholder="Optional (for VAT bills)"
                    value={pan}
                    onChange={(e) => setPan(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
                style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 20px', marginTop: 4 }}
              >
                {saving ? 'Saving…' : 'Save Details'}
              </button>
            </form>

            {/* KYC Identity Verification Section */}
            <div style={{ background: 'var(--bg-surface)', padding: 18, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: 8 }}>
                Identity Document on File (KYC)
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                Required for equipment custody handover without high cash deposits (D1 / T2-03). Stored in encrypted private storage.
              </p>

              {profile?.id_doc_path ? (
                <div
                  style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--green-text)', fontSize: '0.88rem' }}>
                        ✓ {profile.id_doc_type || 'ID Document'} On File
                      </span>
                      {profile.id_doc_number && (
                        <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>
                          Document No: {profile.id_doc_number}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                      {profile.id_doc_uploaded_at ? new Date(profile.id_doc_uploaded_at).toLocaleDateString() : 'Active'}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    color: 'var(--accent-gold)',
                    marginBottom: 16,
                  }}
                >
                  ⚠️ No government identity document on file yet. Uploading your ID speeds up your rental confirmation.
                </div>
              )}

              {/* Upload New / Replacement Document Form */}
              <form onSubmit={handleUploadKyc} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label htmlFor="kyc-doc-type" className="form-label">
                      Document Type
                    </label>
                    <select
                      id="kyc-doc-type"
                      className="form-input"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                    >
                      <option value="Citizenship">Citizenship (नागरिकता)</option>
                      <option value="Driving License">Driving License (सवारी चालक)</option>
                      <option value="Passport">Passport (राहदानी)</option>
                      <option value="PAN Certificate">PAN Certificate</option>
                      <option value="Company Registration">Company Registration</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="kyc-doc-number" className="form-label">
                      Document Number *
                    </label>
                    <input
                      id="kyc-doc-number"
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. 27-01-78-XXXXX"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="kyc-file-input" className="form-label">
                    Scan or Photo (PNG, JPG, PDF up to 10MB) *
                  </label>
                  <input
                    id="kyc-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    required
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 0',
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={uploading || !selectedFile || !docNumber.trim()}
                  style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 20px', marginTop: 4 }}
                >
                  {uploading ? 'Uploading Document…' : profile?.id_doc_path ? 'Update ID Document' : 'Upload ID on File'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
