/**
 * Viewport Testing Utilities — NEM-04 RWD-06
 *
 * Runs component tests at all 5 canonical viewports from `lib/breakpoints.ts`:
 *   390   — iPhone 14/15 class (phone)
 *   800   — small tablet / split-screen (tablet)
 *   1194  — iPad Pro 11" landscape (tablet)
 *   1280  — desktop boundary itself (desktop)
 *   1920  — target desktop (desktop)
 *
 * Usage:
 *   import { testAtAllViewportsSync, renderAtViewport } from '@/lib/testUtils/viewportTest'
 *
 *   testAtAllViewportsSync('renders without horizontal scroll', async ({ width, renderAtWidth }) => {
 *     const result = await renderAtWidth(<MyComponent />, {})
 *     expectNoHorizontalScroll(result.container)
 *   })
 *
 * Uses the project's existing test pattern: createRoot + act + manual DOM
 * (no @testing-library/react dependency)
 */

import { vi, expect, test } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { BP, TEST_WIDTHS, type Viewport, viewportFor } from '@/lib/breakpoints'
import type React from 'react'

/** Result of a viewport-specific render */
export interface ViewportRenderResult<T extends Element = HTMLElement> {
  /** The rendered container element */
  container: HTMLElement
  /** The React root for unmounting */
  root: Root
  /** The viewport classification for this width */
  viewport: Viewport
  /** The exact pixel width used */
  width: number
  /** Unmount and cleanup */
  unmount: () => void
}

/**
 * Set the fake viewport width for jsdom.
 * Must be called before render — jsdom doesn't auto-reflow on resize.
 */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  })
  Object.defineProperty(window, 'outerWidth', {
    configurable: true,
    value: width,
    writable: true,
  })
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
    writable: true,
  })
  window.dispatchEvent(new Event('resize'))
}

/**
 * Reset viewport to default (desktop 1920)
 */
export function resetViewport(): void {
  setViewportWidth(1920)
}

/**
 * Render a component at a specific viewport width.
 * Returns the container, root, viewport metadata, and unmount function.
 */
export async function renderAtViewport<Props extends object>(
  ui: React.ReactElement<Props>,
  width: number,
  _renderOptions?: Record<string, unknown>
): Promise<ViewportRenderResult> {
  setViewportWidth(width)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{ui}</MemoryRouter>)
  })
  return {
    container,
    root,
    viewport: viewportFor(width),
    width,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
      resetViewport()
    },
  }
}

/**
 * Assert that the container has no horizontal scroll.
 */
export function expectNoHorizontalScroll(container: HTMLElement): void {
  expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth)
}

/**
 * Matcher to check if an element has horizontal overflow scroll.
 * Usage: expect(element).toHaveHorizontalScroll()
 */
export function toHaveHorizontalScroll(element: HTMLElement): { pass: boolean; message: () => string } {
  const hasScroll = element.scrollWidth > element.clientWidth
  return {
    pass: hasScroll,
    message: () => hasScroll
      ? `Expected element not to have horizontal scroll, but scrollWidth=${element.scrollWidth} > clientWidth=${element.clientWidth}`
      : `Expected element to have horizontal scroll`,
  }
}

/**
 * Matcher to check if any element in container has horizontal overflow.
 */
export function toHaveAnyHorizontalScroll(container: HTMLElement): { pass: boolean; message: () => string } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
  const offenders: HTMLElement[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement
    if (el.scrollWidth > el.clientWidth) {
      offenders.push(el)
    }
  }
  const pass = offenders.length > 0
  return {
    pass,
    message: () => pass
      ? `Found ${offenders.length} element(s) with horizontal overflow:\n${offenders.map(e => `  ${e.tagName}${e.id ? '#' + e.id : ''}${e.className ? '.' + e.className.split(' ').join('.') : ''} (scrollWidth=${e.scrollWidth}, clientWidth=${e.clientWidth})`).join('\n')}`
      : `No elements with horizontal overflow found`,
  }
}

/** Type helper for renderAtWidth function */
type RenderAtWidthFn = <T>(ui: React.ReactElement<T>, options?: Record<string, unknown>) => Promise<ViewportRenderResult>

/**
 * Run a test callback at all 5 canonical viewports (sync version).
 * Generates 5 separate test cases with descriptive names.
 */
export function testAtAllViewportsSync(
  baseName: string,
  callback: (ctx: { width: number; viewport: Viewport; renderAtWidth: RenderAtWidthFn }) => void
): void {
  for (const width of TEST_WIDTHS) {
    const viewport = viewportFor(width)
    const suffix = `${viewport} (${width}px)`
    const testName = `${baseName} — ${suffix}`

    test(testName, async () => {
      const renderAtWidth: RenderAtWidthFn = async (ui, options) =>
        renderAtViewport(ui, width, options)
      callback({ width, viewport, renderAtWidth })
    })
  }
}

/**
 * Run a test at a single viewport.
 */
export async function testAtViewport(
  name: string,
  width: number,
  testFn: (ctx: { width: number; viewport: Viewport; renderAtWidth: RenderAtWidthFn }) => void
): Promise<void> {
  const viewport = viewportFor(width)
  test(`${name} — ${viewport} (${width}px)`, async () => {
    const renderAtWidth: RenderAtWidthFn = async (ui, options) =>
      renderAtViewport(ui, width, options)
    await testFn({ width, viewport, renderAtWidth })
  })
}

/**
 * Run a test at phone, tablet, and desktop breakpoints only (3 viewports).
 */
export function testAtBreakpoints(
  baseName: string,
  callback: (ctx: { width: number; viewport: Viewport; renderAtWidth: RenderAtWidthFn }) => void
): void {
  const breakpointWidths = [390, 1194, 1920]
  for (const width of breakpointWidths) {
    const viewport = viewportFor(width)
    const suffix = `${viewport} (${width}px)`
    test(`${baseName} — ${suffix}`, async () => {
      const renderAtWidth: RenderAtWidthFn = async (ui, options) =>
        renderAtViewport(ui, width, options)
      await callback({ width, viewport, renderAtWidth })
    })
  }
}

// Extend Vitest's expect with custom matchers
expect.extend({
  toHaveHorizontalScroll,
  toHaveAnyHorizontalScroll,
})

// Extend Vitest's expect for TypeScript
declare module 'vitest' {
  interface Assertion<T = any> {
    not: Assertion<T>
    toHaveHorizontalScroll(): T
    toHaveAnyHorizontalScroll(): T
  }
  interface AsymmetricMatchersContaining {
    toHaveHorizontalScroll(): any
    toHaveAnyHorizontalScroll(): any
  }
}