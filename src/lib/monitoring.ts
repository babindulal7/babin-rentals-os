/**
 * Error reporting — one function, no SDK.
 *
 * Before this file, a render-time crash in production was caught by
 * `components/shell/ErrorBoundary` and written to `console.error`, where
 * nobody was standing. The operator saw a banner, the crash was never
 * reported, and the same bug could run for weeks in the warehouse without a
 * single person who could fix it ever learning it existed.
 *
 * ## Why no `@sentry/browser`
 *
 * The SDK is ~30 kB gzipped of transport, integrations and session tracking
 * for what this app actually needs: post one JSON envelope when something
 * throws. It is also a paid dependency decision nobody has made. This module
 * speaks Sentry's public envelope endpoint directly — the same HTTP contract
 * the SDK uses — so if Sentry (or a self-hosted GlitchTip / Bugsink, which
 * accept the same envelope format) is ever chosen, it works with a DSN and no
 * code change. If it is never chosen, this costs ~1 kB and does nothing.
 *
 * ## The gate
 *
 * `VITE_SENTRY_DSN` unset — the normal state of this repo, and of every dev
 * machine — means `captureError` returns immediately. No network, no
 * listeners, no console noise. Nothing here can be the reason a page is slow
 * or a test is flaky.
 *
 * **No DSN is committed.** It is supplied per environment at build time. A
 * Sentry DSN is a public client key by design (it can only write events), but
 * it still names the project, so it is configured, not checked in.
 *
 * ## What is sent, and what is deliberately not
 *
 * Error name, message, stack, the build's release tag, and `location.pathname`
 * — **path only**. The query string and hash are dropped: search boxes and
 * filter state end up there, and PLAN.md's privacy posture does not put client
 * data into a third-party log because a URL happened to carry it.
 *
 * Callers control the rest through `context`. That bag is serialised verbatim,
 * so **do not put client PII, phone numbers, or rupee figures in it** — pass
 * ids and counts, which are enough to find the bug. Money is a role-gated
 * concern in this product (Warehouse/Technician/Driver/Client see none of it);
 * an error report is not a hole in that.
 *
 * ## Failure posture
 *
 * Monitoring never becomes the outage. Every path is wrapped: a malformed DSN,
 * a circular `context`, a blocked request or a missing `fetch` all end in a
 * silent return. `captureError` is synchronous, returns `void`, never throws
 * and never rejects — it is safe to call from a `catch` block, from
 * `componentDidCatch`, and from an unload handler.
 */

/** Extra facts attached to a report. Serialised as-is — no PII, no money. */
export type ErrorContext = Record<string, unknown>

interface ParsedDsn {
  readonly envelopeUrl: string
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_REGEX = /(?:\+?977[- ]?)?(?:98\d{8}|97\d{8}|01[- ]?\d{7})/g
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g
const TOKEN_HEADER_REGEX = /(?:Bearer\s+)[a-zA-Z0-9_\-\.]{15,}/gi
const MONEY_PATTERN = /(?:Rs\.?|NPR|रू|रु\.?)\s*[0-9\u0966-\u096F,]+(?:\.[0-9\u0966-\u096F]{1,2})?/gi

/** Redact PII (email, phone, tokens, financial amounts) from any telemetry string. */
export function sanitizeTelemetryString(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .replace(JWT_REGEX, '[TOKEN_REDACTED]')
    .replace(TOKEN_HEADER_REGEX, 'Bearer [TOKEN_REDACTED]')
    .replace(EMAIL_REGEX, '[EMAIL_REDACTED]')
    .replace(PHONE_REGEX, '[PHONE_REDACTED]')
    .replace(MONEY_PATTERN, '[MONEY_REDACTED]')
}

const FORBIDDEN_CONTEXT_KEYS = new Set([
  'phone', 'mobile', 'email', 'name', 'client_name', 'clientname', 'full_name', 'fullname',
  'amount', 'total', 'subtotal', 'rate', 'price', 'balance', 'deposit', 'vat_amount', 'discount',
])

/** Recursively sanitize context object preventing client PII or rupee values from entering telemetry. */
export function sanitizeContext(context?: ErrorContext): ErrorContext | undefined {
  if (!context || typeof context !== 'object') return undefined
  try {
    const out: ErrorContext = {}
    for (const [key, value] of Object.entries(context)) {
      const lower = key.toLowerCase()
      if (FORBIDDEN_CONTEXT_KEYS.has(lower)) {
        out[key] = '[REDACTED]'
        continue
      }
      if (typeof value === 'string') {
        out[key] = sanitizeTelemetryString(value)
      } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        out[key] = value
      } else if (typeof value === 'object') {
        try {
          out[key] = JSON.parse(sanitizeTelemetryString(JSON.stringify(value)))
        } catch {
          out[key] = '[Complex Object]'
        }
      }
    }
    return out
  } catch {
    return { sanitized: false }
  }
}

/** Formats eventId into a human-readable 8-char reference code (e.g. REF-A1B2C3D4). */
export function toReferenceCode(eventId: string): string {
  const clean = eventId.replace(/[^a-f0-9]/gi, '')
  const prefix = clean.slice(0, 8).toUpperCase()
  return prefix ? `REF-${prefix}` : 'REF-UNKNOWN'
}

export interface StaffErrorMessage {
  title: string
  line: string
  action: string
  referenceCode: string
}

/**
 * Transforms an unhandled error into a clean, safe single-line message for staff UI.
 * Masks raw database errors, syntax exceptions, and internal constraint texts.
 */
export function formatStaffErrorMessage(err: unknown, suppliedRefCode?: string): StaffErrorMessage {
  const refCode = suppliedRefCode || toReferenceCode(newEventId())
  const rawMsg = err instanceof Error ? err.message : String(err || '')

  // Detect raw database, gate, or internal SQL errors
  const isDbOrGate =
    rawMsg.includes('GATE:') ||
    rawMsg.includes('PGRST') ||
    /relation\s+["']?[\w\.]+["']?\s+does\s+not\s+exist/i.test(rawMsg) ||
    /violates\s+.*constraint/i.test(rawMsg) ||
    /\b(?:42501|42P01|23505|23514|23503)\b/.test(rawMsg) ||
    /syntax\s+error\s+at\s+or\s+near/i.test(rawMsg) ||
    /PostgresError/i.test(rawMsg)

  if (isDbOrGate) {
    console.error(`[StaffError] Raw system error suppressed from screen:`, err)
    return {
      title: 'This screen hit a system problem',
      line: 'An unexpected database or server constraint stopped this action.',
      action: 'Trying again in a few moments may help. If it persists, quote this reference code to support.',
      referenceCode: refCode,
    }
  }

  const cleanLine = sanitizeTelemetryString(rawMsg).slice(0, 160)
  return {
    title: 'This screen hit a problem',
    line: cleanLine || 'An unexpected error stopped this page from rendering.',
    action: 'Clicking "Retry" will attempt to recover the screen inline without losing offline state.',
    referenceCode: refCode,
  }
}

/**
 * Reads one key off Vite's env bag.
 *
 * `import.meta.env` is typed in `src/vite-env.d.ts` with only the two Supabase
 * keys spelled out, so this goes through an untyped read and narrows on the
 * way out. The `typeof` check is the actual guarantee: anything that is not a
 * non-empty string becomes `''`, which every caller reads as "not configured".
 */
function readEnv(key: string): string {
  try {
    const bag = import.meta.env as unknown as Record<string, unknown>
    const raw = bag[key]
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/**
 * `https://<publicKey>@<host><path>/<projectId>` → the envelope endpoint.
 *
 * The key travels in the query string (`sentry_key`) rather than an
 * `X-Sentry-Auth` header, because a custom header would force a CORS preflight
 * on every report and `navigator.sendBeacon` cannot set headers at all.
 */
function parseDsn(dsn: string): ParsedDsn | null {
  if (!dsn) return null
  try {
    const u = new URL(dsn)
    const publicKey = u.username
    const segments = u.pathname.split('/').filter(Boolean)
    const projectId = segments.pop()
    if (!publicKey || !projectId) return null
    const prefix = segments.length > 0 ? `/${segments.join('/')}` : ''
    return {
      envelopeUrl:
        `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/` +
        `?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`,
    }
  } catch {
    // A DSN typo is a deployment mistake, not a runtime error for the operator
    // to see. It disables reporting; it does not break the app.
    return null
  }
}

const DSN = parseDsn(readEnv('VITE_SENTRY_DSN'))
const RELEASE = readEnv('VITE_APP_VERSION')
const ENVIRONMENT = readEnv('MODE') || 'production'

/**
 * A crash inside a render loop can fire hundreds of times a second. These caps
 * mean a broken screen files a report, not a denial-of-service against the
 * error tracker (and, on a metered Nepali mobile connection, not a data bill).
 */
const MAX_EVENTS_PER_SESSION = 25
const DEDUPE_WINDOW_MS = 5_000

let sentCount = 0
const lastSeen = new Map<string, number>()

/** 32 lowercase hex characters — the shape Sentry requires for `event_id`. */
function newEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '')
    }
  } catch {
    /* falls through to Math.random */
  }
  let out = ''
  while (out.length < 32) out += Math.floor(Math.random() * 16).toString(16)
  return out.slice(0, 32)
}

interface Described {
  type: string
  value: string
  stack: string
}

/** Anything can be thrown in JS, so `unknown` in and a describable shape out. */
function describe(err: unknown): Described {
  if (err instanceof Error) {
    return {
      type: err.name || 'Error',
      value: err.message || String(err),
      stack: typeof err.stack === 'string' ? err.stack : '',
    }
  }
  if (typeof err === 'string') return { type: 'Error', value: err, stack: '' }
  try {
    const json = JSON.stringify(err)
    return { type: 'Error', value: typeof json === 'string' ? json : String(err), stack: '' }
  } catch {
    return { type: 'Error', value: 'Unserialisable value was thrown', stack: '' }
  }
}

/** Path only — never `search` or `hash`. See the header note on privacy. */
function pagePath(): string {
  try {
    return typeof location !== 'undefined' ? location.pathname : ''
  } catch {
    return ''
  }
}

/**
 * Fire and forget. `sendBeacon` first because it survives the page being torn
 * down — which is exactly what happens when a crash is followed by the
 * operator hitting reload — and because it never triggers a preflight. `fetch`
 * with `keepalive` is the fallback for browsers where the beacon queue is full
 * or the API is missing.
 */
function post(body: string): void {
  if (!DSN) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
      if (navigator.sendBeacon(DSN.envelopeUrl, blob)) return
    }
    if (typeof fetch === 'function') {
      void fetch(DSN.envelopeUrl, {
        method: 'POST',
        body,
        keepalive: true,
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      }).catch(() => {
        /* offline, blocked by an extension, DNS down — all fine, all silent */
      })
    }
  } catch {
    /* monitoring never becomes the outage */
  }
}

/** True when a DSN was supplied and parsed. Reports are dropped when false. */
export function isMonitoringEnabled(): boolean {
  return DSN !== null
}

export interface CapturedErrorInfo {
  eventId: string
  referenceCode: string
}

/**
 * Report a caught error.
 *
 * Sanitizes all PII, phone numbers, tokens, and rupee figures before transmission.
 * Returns an eventId and short human reference code matching the Sentry event prefix.
 *
 * @param err     Whatever was caught — `Error`, string, or any thrown value.
 * @param context Extra facts. Ids and counts only: no client PII, no rupee
 *                amounts. See the module header.
 */
export function captureError(err: unknown, context?: ErrorContext): CapturedErrorInfo | null {
  const eventId = newEventId()
  const referenceCode = toReferenceCode(eventId)

  if (!DSN) return { eventId, referenceCode }
  if (sentCount >= MAX_EVENTS_PER_SESSION) return { eventId, referenceCode }

  try {
    const { type, value, stack } = describe(err)
    const safeType = sanitizeTelemetryString(type)
    const safeValue = sanitizeTelemetryString(value)
    const safeStack = sanitizeTelemetryString(stack)
    const safeContext = sanitizeContext(context)

    const fingerprint = `${safeType}:${safeValue}`
    const now = Date.now()
    const previous = lastSeen.get(fingerprint)
    if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) {
      return { eventId, referenceCode }
    }
    lastSeen.set(fingerprint, now)

    const event = {
      event_id: eventId,
      timestamp: now / 1000,
      platform: 'javascript',
      level: 'error',
      logger: 'babin-rentals-os',
      environment: ENVIRONMENT,
      ...(RELEASE ? { release: RELEASE } : {}),
      exception: { values: [{ type: safeType, value: safeValue }] },
      request: { url: pagePath() },
      extra: {
        ...(safeStack ? { stack: safeStack } : {}),
        ...(safeContext ?? {}),
      },
    }

    // Built before anything is sent: a circular `context` throws here, inside
    // the try, rather than leaving a half-written envelope on the wire.
    const envelope =
      `${JSON.stringify({ event_id: eventId, sent_at: new Date(now).toISOString() })}\n` +
      `${JSON.stringify({ type: 'event' })}\n` +
      `${JSON.stringify(event)}\n`

    sentCount += 1
    post(envelope)
    return { eventId, referenceCode }
  } catch {
    /* a report that cannot be built is dropped, never surfaced */
    return { eventId, referenceCode }
  }
}

/**
 * Triggers a synthetic test event for staging verification (T1-08).
 * Contains strictly non-PII test facts to audit ingest without exposing operational data.
 */
export function triggerSyntheticTestError(): CapturedErrorInfo | null {
  return captureError(new Error('SYNTHETIC_STAGING_TEST_ERROR: Stage verification event (T1-08)'), {
    isSyntheticTest: true,
    testVerificationCard: 'T1-08',
    triggeredAt: new Date().toISOString(),
  })
}

/**
 * Guards against a second install. `main.tsx` runs once, but Vite's HMR
 * re-executes this module on edit and React 18 StrictMode double-invokes
 * effects in development — either would otherwise stack a duplicate pair of
 * listeners and file every async crash twice.
 */
let handlersInstalled = false

/**
 * Attach the two global listeners: `error` and `unhandledrejection`.
 *
 * `components/shell/ErrorBoundary` catches one narrow thing — a component
 * throwing *during render*. That is not where most of this app fails. A
 * Supabase call rejecting inside a `useEffect`, a scan handler throwing off a
 * `@zxing/browser` event, a `void`-ed promise in the offline sync queue: none
 * of those pass through React's render path, so none of them ever reached
 * `captureError`. On a warehouse tablet they surfaced as a button that did
 * nothing, which is the hardest possible bug to report and the easiest to
 * dismiss as "the tablet is slow".
 *
 * ## Why `addEventListener` and not `window.onerror`
 *
 * `onerror` is a single slot. Assigning it silently evicts whatever else set
 * it — a browser extension, a future SDK, the Vite dev overlay that shows
 * errors on screen while developing. Listeners compose; the assignment does
 * not.
 *
 * ## Resource failures are not reported
 *
 * The `error` event also fires for a `<img>` or `<script>` that failed to
 * load, with `event.error` null and the element as target. On a metered Nepali
 * connection behind a flaky tower that is *normal*, not a defect, and
 * reporting it would drown the real crashes in the 25-event session budget.
 * Only events carrying a real thrown value are filed.
 *
 * ## Not installed when there is no DSN
 *
 * The module header promises "no listeners" when `VITE_SENTRY_DSN` is unset —
 * the state of every dev machine and of this repo. That is honoured here
 * rather than by leaning on `captureError`'s early return, so an unconfigured
 * build attaches nothing to `window` at all.
 *
 * Safe to call more than once. Never throws.
 */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled) return
  if (!DSN) return
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return

  try {
    window.addEventListener('error', (event: ErrorEvent) => {
      // Resource load failure — see the note above.
      if (!event.error) return
      captureError(event.error, {
        handler: 'window.error',
        source: typeof event.filename === 'string' ? event.filename : null,
        line: typeof event.lineno === 'number' ? event.lineno : null,
      })
    })

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      // `reason` is whatever was passed to `reject` — often an Error, but a
      // bare string or a Supabase error object just as often. `describe`
      // inside `captureError` already handles all three.
      captureError(event.reason, { handler: 'unhandledrejection' })
    })

    handlersInstalled = true
  } catch {
    /* monitoring never becomes the outage */
  }
}
