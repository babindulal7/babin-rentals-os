import { describe, it, expect } from 'vitest'
// Vite `?raw` import, as breakpoints.test.ts reads this same file.
import indexHtml from '../../index.html?raw'

/**
 * Runs the boot screen's real inline script against a fake window, document, clock and console, so each test
 * starts from a clean page and the test owns the clock. The rules under test (index.html):
 *
 *   - a failure that stops the app outright paints at once, while #root is still empty: the app's own module
 *     script failing to load (the Vite dev client is not the app, and its failure is transient);
 *   - every other failure is kept for the console and never paints by itself;
 *   - the 25 second watchdog after load paints a page whose #root is still empty;
 *   - a page whose #root has children is never painted.
 */

/** The boot fallback is the one inline script that names paintIfDead. */
const SCRIPT_BODY = (() => {
  const blocks = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '')
  const boot = blocks.find((block) => block.includes('paintIfDead'))
  if (boot === undefined) throw new Error('the boot fallback script was not found in index.html')
  return boot
})()

const USER_AGENT = 'TEST-USER-AGENT-SENTINEL'
const APP_MODULE = { tagName: 'SCRIPT', type: 'module', src: 'http://localhost:5173/src/main.tsx', href: '' }
const CLIENT_COPY = 'This page could not open'

interface FakeRoot {
  childElementCount: number
  innerHTML: string
}

interface BootHarness {
  root: FakeRoot
  consoleLines: string[]
  /** An error event on the window itself (an uncaught exception). */
  windowError(message: string): void
  /** An error event on a resource element (a script, stylesheet or image that failed). */
  resourceError(element: Record<string, unknown>): void
  rejection(reason: unknown): void
  load(): void
  /** Simulates React mounting into #root. */
  mount(): void
  /** Advances the fake clock, running every timer that falls due. */
  advance(ms: number): void
}

function bootPage(): BootHarness {
  type Handler = (event: Record<string, unknown>) => void
  const handlers = new Map<string, Handler[]>()
  const timers: Array<{ due: number; run: () => void }> = []
  let now = 0

  const root: FakeRoot = { childElementCount: 0, innerHTML: '' }
  const consoleLines: string[] = []
  const windowObject = {
    addEventListener(type: string, handler: Handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler])
    },
  }
  const fakeDocument = {
    title: '',
    body: { innerHTML: '' },
    getElementById: (id: string) => (id === 'root' ? root : null),
  }
  const fakeConsole = {
    error: (...parts: unknown[]) => {
      consoleLines.push(parts.map(String).join(' '))
    },
  }
  const fakeSetTimeout = (run: () => void, ms: number) => {
    timers.push({ due: now + ms, run })
  }

  new Function('window', 'document', 'navigator', 'console', 'setTimeout', SCRIPT_BODY)(
    windowObject,
    fakeDocument,
    { userAgent: USER_AGENT },
    fakeConsole,
    fakeSetTimeout,
  )

  const dispatch = (type: string, event: Record<string, unknown>) => {
    for (const handler of handlers.get(type) ?? []) handler(event)
  }

  return {
    root,
    consoleLines,
    windowError(message) {
      dispatch('error', { target: windowObject, message, filename: '', lineno: 0 })
    },
    resourceError(element) {
      dispatch('error', { target: element })
    },
    rejection(reason) {
      dispatch('unhandledrejection', { reason })
    },
    load() {
      dispatch('load', {})
    },
    mount() {
      root.childElementCount = 1
      root.innerHTML = '<main>app</main>'
    },
    advance(ms) {
      const end = now + ms
      for (;;) {
        const due = timers.filter((t) => t.due <= end).sort((a, b) => a.due - b.due)[0]
        if (due === undefined) break
        timers.splice(timers.indexOf(due), 1)
        now = due.due
        due.run()
      }
      now = end
    },
  }
}

describe('boot fallback — what paints the fallback', () => {
  it('paints at once when the app module script fails to load, while #root is still empty', () => {
    const page = bootPage()
    page.resourceError(APP_MODULE)
    expect(page.root.innerHTML).toContain(CLIENT_COPY)
  })

  it('still paints the app module failure when a non-fatal failure came first', () => {
    const page = bootPage()
    page.rejection(new Error('Service worker registration failed'))
    page.resourceError(APP_MODULE)
    expect(page.root.innerHTML).toContain(CLIENT_COPY)
  })

  it('does not paint for a failed Vite dev client, and the app still mounts', () => {
    const page = bootPage()
    page.resourceError({ tagName: 'SCRIPT', type: 'module', src: 'http://localhost:5173/@vite/client', href: '' })
    expect(page.root.innerHTML).toBe('')
    page.load()
    page.mount()
    page.advance(60_000)
    expect(page.root.innerHTML).toBe('<main>app</main>')
  })

  it('never paints non-fatal failures on their own, however long the mount takes', () => {
    const page = bootPage()
    page.windowError('ResizeObserver loop completed with undelivered notifications')
    page.rejection(new Error('Service worker registration failed'))
    page.resourceError({ tagName: 'LINK', type: 'text/css', href: '/assets/index.css', src: '' })
    page.resourceError({ tagName: 'IMG', src: '/icons/logo.png', href: '' })
    page.advance(60_000)
    expect(page.root.innerHTML).toBe('')
  })

  it('paints the watchdog fallback 25 seconds after load, if #root is still empty', () => {
    const page = bootPage()
    page.windowError('a late, non-fatal error')
    page.load()
    page.advance(24_999)
    expect(page.root.innerHTML).toBe('')
    page.advance(1)
    expect(page.root.innerHTML).toContain(CLIENT_COPY)
  })

  it('does not paint at the watchdog when the app mounted in time', () => {
    const page = bootPage()
    page.load()
    page.advance(10_000)
    page.mount()
    page.advance(60_000)
    expect(page.root.innerHTML).toBe('<main>app</main>')
  })

  it('never paints a mounted page, even after failures that happen later', () => {
    const page = bootPage()
    page.load()
    page.mount()
    page.windowError('late error after mount')
    page.rejection(new Error('late rejection after mount'))
    page.resourceError(APP_MODULE)
    page.advance(60_000)
    expect(page.root.innerHTML).toBe('<main>app</main>')
  })

  it('keeps the details and the user agent on the console, not on the page', () => {
    const page = bootPage()
    page.resourceError(APP_MODULE)
    const logged = page.consoleLines.join('\n')
    expect(logged).toContain('Babin Rentals did not start')
    expect(logged).toContain('main.tsx')
    expect(logged).toContain(`User agent: ${USER_AGENT}`)
    expect(page.root.innerHTML).not.toContain(USER_AGENT)
    expect(page.root.innerHTML).not.toContain('main.tsx')
  })

  it('paints once, and a later trigger does not overwrite the page', () => {
    const page = bootPage()
    page.resourceError(APP_MODULE)
    const painted = page.root.innerHTML
    page.resourceError(APP_MODULE)
    page.load()
    page.advance(30_000)
    expect(page.root.innerHTML).toBe(painted)
  })
})
