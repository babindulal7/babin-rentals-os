import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Button, Input } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import { AuthCard } from './AuthCard'
import { PasswordInput } from './PasswordInput'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import { useTranslation } from '../../lib/i18n'
import { IS_MOCK } from '../../lib/supabase'
import { MOCK_LOGINS } from '../../lib/devQuickLogins'
import './auth.css'

const REMEMBER_EMAIL_KEY = 'babin.auth.remember_email'

/**
 * **Staff sign-in.**
 *
 * Authenticates against Supabase Auth. The role that governs capability checks
 * is read from `users.primary_role` by `AuthProvider`.
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [awaitingProfile, setAwaitingProfile] = useState(false)
  const { signIn, user } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const lockoutTimerRef = useRef<number | null>(null)

  // Load remembered work email on mount
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (savedEmail) {
        setEmail(savedEmail)
        setRememberEmail(true)
      }
    } catch {
      /* ignore storage access error */
    }
  }, [])

  // Leave /login only once the staff profile has loaded. Navigating straight
  // after signIn races the route guard, which sees user === null and sends the
  // visitor straight back here.
  useEffect(() => {
    if (!awaitingProfile || !user) return
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
  }, [awaitingProfile, user, location.state, navigate])

  // A valid password is not yet a resolved staff session. Prevent a second
  // request while the profile arrives; recover with an honest retry if it
  // never resolves, rather than redirecting or leaving the form stuck.
  useEffect(() => {
    if (!awaitingProfile || user) return
    const timer = window.setTimeout(() => {
      setAwaitingProfile(false)
      setError(t('auth.profileTimeout', 'Could not load your staff profile. Please try signing in again.'))
    }, 20_000)
    return () => window.clearTimeout(timer)
  }, [awaitingProfile, user, t])

  // Lockout countdown timer ticker
  useEffect(() => {
    if (lockoutSeconds > 0) {
      lockoutTimerRef.current = window.setTimeout(() => {
        setLockoutSeconds((prev) => prev - 1)
      }, 1000)
    } else if (lockoutSeconds === 0 && lockoutTimerRef.current) {
      clearTimeout(lockoutTimerRef.current)
      lockoutTimerRef.current = null
    }

    return () => {
      if (lockoutTimerRef.current) {
        clearTimeout(lockoutTimerRef.current)
      }
    }
  }, [lockoutSeconds])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || awaitingProfile || lockoutSeconds > 0) return
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError(t('auth.missingFields', 'Enter your work email and password.'))
      return
    }

    setBusy(true)
    let signInError: string | null
    try {
      const result = await signIn(trimmedEmail, password)
      signInError = result.error
    } catch {
      signInError = t('auth.signInUnavailable', 'Sign-in could not complete. Please try again.')
    } finally {
      setBusy(false)
    }

    if (signInError) {
      // Parse rate limit or lockout cooldowns if returned by Supabase
      const matchSeconds = signInError.match(/after (\d+) seconds/i)
      if (matchSeconds && matchSeconds[1]) {
        const sec = parseInt(matchSeconds[1], 10)
        if (!isNaN(sec) && sec > 0) {
          setLockoutSeconds(sec)
        }
      }

      setError(signInError)
      return
    }

    // Persist or clear remembered email on successful authentication
    try {
      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail)
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
    } catch {
      /* ignore */
    }

    // Return the user to wherever the guard intercepted them, not always /dashboard.
    setAwaitingProfile(true)
  }

  return (
    <AuthCard
      title={t('auth.welcomeTitle', 'Welcome to Babin Rentals')}
      subtitle={t('auth.welcomeSubtitle', 'Sign in with your work email to continue.')}
      footer={<LoginFooter />}
    >
      <form onSubmit={handleLogin} noValidate className="auth-form">
        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">
            {t('auth.emailLabel', 'Work Email')}
          </label>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder', 'name@babinrentals.com')}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password" className="auth-label">
            {t('auth.passwordLabel', 'Password')}
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholder', '••••••••')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        {/* Law 12 — inline persistent error, never a toast */}
        {error && (
          <div id="login-error">
            <ErrorBanner title={t('auth.signInError', 'Could not sign in')} message={error} />
          </div>
        )}

        </div>

        {/* Remember email checkbox */}
        <label className="auth-remember-row">
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(e) => setRememberEmail(e.target.checked)}
            className="auth-remember-checkbox"
          />
          <span className="auth-remember-label">{t('auth.rememberEmail', 'Remember work email on this device')}</span>
        </label>

        {/* Live lockout countdown feedback */}
        {lockoutSeconds > 0 && (
          <div className="auth-lockout-banner" role="alert" aria-live="assertive">
            <Icon name="alert_circle" size={16} />
            <span>
              {t('auth.lockoutMessage', 'Too many sign-in attempts. Please wait {seconds}s before retrying.', { seconds: lockoutSeconds })}
            </span>
          </div>
        )}

        {/* Mock mode: Quick 1-click role logins (Strictly zero emojis) */}
        {IS_MOCK && (
          <div role="status" className="auth-mock-box">
            <div className="auth-mock-title">{t('auth.quickSignIn', 'Quick Sign-In (Demo / Offline Mode):')}</div>
            <div className="auth-mock-buttons">
              {MOCK_LOGINS.map((l) => (
                <button
                  key={l.email}
                  type="button"
                  className="auth-mock-btn"
                  disabled={busy || awaitingProfile || lockoutSeconds > 0}
                  onClick={async () => {
                    if (busy || awaitingProfile || lockoutSeconds > 0) return
                    setEmail(l.email)
                    setPassword('demo1234')
                    setBusy(true)
                    const { error: err } = await signIn(l.email, 'demo1234')
                    setBusy(false)
                    if (err) {
                      setError(err)
                    } else {
                      if (rememberEmail) {
                        try {
                          localStorage.setItem(REMEMBER_EMAIL_KEY, l.email)
                        } catch {
                          /* ignore */
                        }
                      }
                      setAwaitingProfile(true)
                    }
                  }}
                  title={`Sign in as ${l.role}`}
                >
                  <Icon
                    name={
                      l.role === 'Owner'
                        ? 'crew'
                        : l.role === 'Warehouse'
                          ? 'package'
                          : 'card'
                    }
                    size={14}
                  />
                  <span>{l.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={busy || awaitingProfile || lockoutSeconds > 0}
          style={{ minHeight: 44, fontSize: 16 }}
        >
          {awaitingProfile ? t('auth.loadingProfile', 'Loading staff profile…') : busy ? t('auth.submitting', 'Signing in…') : lockoutSeconds > 0 ? `Wait (${lockoutSeconds}s)` : t('auth.submit', 'Sign In')}
        </Button>
      </form>
    </AuthCard>
  )
}

/**
 * The secondary routes under the divider.
 */
function LoginFooter() {
  const { t } = useTranslation()
  return (
    <>
      <Link
        to="/forgot-password"
        className="auth-footer-link"
      >
        {t('auth.forgotPassword', 'Forgot password?')}
      </Link>
    </>
  )
}
