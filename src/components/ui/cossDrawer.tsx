import { forwardRef, createContext, useContext } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { cn } from '../../lib/cn'
import Icon from './Icon'

type ClassProp<T> = string | ((state: T) => string | undefined) | undefined

function resolveBaseUiClass<T>(userClass: ClassProp<T>, ...baseClasses: (string | boolean | undefined | null)[]): ClassProp<T> {
  if (typeof userClass === 'function') {
    return (state: T) => cn(...baseClasses, userClass(state))
  }
  return cn(...baseClasses, userClass)
}

/*
 * coss-compliant Drawer, composed over Base UI's Drawer primitives with the
 * app's real inline-style + CSS-variable system. Same story as cossDialog: the
 * merged coss-ui-modernization version copied Tailwind utility classes that
 * compile to nothing in the ops bundle, so an opened drawer would have rendered
 * as an unpositioned block. Composition API (Root with position/swipeDirection,
 * Trigger/Close/Portal/Backdrop/Popup/Header/Title/Description/Panel/Footer)
 * is unchanged; the paint now reads the theme tokens Modal and the filter
 * drawers already use (--scrim, --z-overlay/--z-drawer, --card, --border2).
 *
 * Edge-panel sizes follow the app's own precedents rather than coss defaults:
 * 480px side width is Modal's sidePeek width; the bottom sheet's 85dvh cap and
 * top-rounded corners match Modal's phone sheet band. coss replaced Sheet with
 * Drawer — this file is the Drawer-only path, no Sheet shims.
 */

export type DrawerPosition = 'right' | 'left' | 'top' | 'bottom'

interface DrawerContextValue {
  position: DrawerPosition
}

const DrawerContext = createContext<DrawerContextValue>({ position: 'right' })

const directionMap: Record<DrawerPosition, DrawerPrimitive.Root.Props['swipeDirection']> = {
  bottom: 'down',
  left: 'left',
  right: 'right',
  top: 'up',
}

export interface DrawerProps extends DrawerPrimitive.Root.Props {
  position?: DrawerPosition
}

export function Drawer({
  position = 'right',
  swipeDirection,
  children,
  ...props
}: DrawerProps) {
  return (
    <DrawerContext.Provider value={{ position }}>
      <DrawerPrimitive.Root
        swipeDirection={swipeDirection ?? directionMap[position]}
        {...props}
      >
        {children}
      </DrawerPrimitive.Root>
    </DrawerContext.Provider>
  )
}

export const DrawerTrigger = DrawerPrimitive.Trigger
export const DrawerClose = DrawerPrimitive.Close
export const DrawerPortal = DrawerPrimitive.Portal

export type DrawerBackdropProps = DrawerPrimitive.Backdrop.Props

export const DrawerBackdrop = forwardRef<HTMLDivElement, DrawerBackdropProps>(function DrawerBackdrop(
  { className, style, ...props },
  ref
) {
  return (
    <DrawerPrimitive.Backdrop
      ref={ref}
      data-slot="drawer-backdrop"
      className={resolveBaseUiClass(className)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-overlay)' as unknown as number,
        background: 'var(--scrim)',
        ...style,
      }}
      {...props}
    />
  )
})

export interface DrawerPopupProps extends DrawerPrimitive.Popup.Props {
  showBar?: boolean
  showCloseButton?: boolean
  container?: HTMLElement | ShadowRoot | { current: HTMLElement | ShadowRoot | null } | null | undefined
  children?: ReactNode
}

/* Wrapper alignment + popup geometry per position. Side drawers are 480px
   (Modal sidePeek width); top/bottom sheets cap at 85dvh like Modal's sheet
   band, with only the inner corners rounded. */
const WRAPPER_ALIGN: Record<DrawerPosition, ComponentProps<'div'>['style']> = {
  right: { justifyContent: 'flex-end', alignItems: 'stretch' },
  left: { justifyContent: 'flex-start', alignItems: 'stretch' },
  bottom: { justifyContent: 'center', alignItems: 'flex-end' },
  top: { justifyContent: 'center', alignItems: 'flex-start' },
}

const POPUP_GEOMETRY: Record<DrawerPosition, ComponentProps<'div'>['style']> = {
  right: { height: '100%', width: '100%', maxWidth: 480, borderLeft: '1px solid var(--border2)' },
  left: { height: '100%', width: '100%', maxWidth: 480, borderRight: '1px solid var(--border2)' },
  bottom: { width: '100%', maxHeight: '85dvh', borderTop: '1px solid var(--border2)', borderRadius: '16px 16px 0 0' },
  top: { width: '100%', maxHeight: '85dvh', borderBottom: '1px solid var(--border2)', borderRadius: '0 0 16px 16px' },
}

export const DrawerPopup = forwardRef<HTMLDivElement, DrawerPopupProps>(function DrawerPopup(
  { className, children, showBar = false, showCloseButton = true, container, style, ...props },
  ref
) {
  const { position } = useContext(DrawerContext)

  return (
    <DrawerPortal container={container}>
      <DrawerBackdrop />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          /* theme.css stacking scale: the drawer sits at --z-drawer (1350),
             above its own --z-overlay scrim (1300) but below --z-modal (1400)
             so a confirmation dialog opened from a drawer paints above it. */
          zIndex: 'var(--z-drawer)' as unknown as number,
          display: 'flex',
          pointerEvents: 'none',
          ...WRAPPER_ALIGN[position],
        }}
      >
        <DrawerPrimitive.Popup
          ref={ref}
          data-slot="drawer-popup"
          className={resolveBaseUiClass(className)}
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--card)',
            color: 'var(--text)',
            boxShadow: 'var(--shadow-modal)',
            outline: 'none',
            ...POPUP_GEOMETRY[position],
            ...style,
          }}
          {...props}
        >
          {showBar && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
              {/* Same handle as Modal's sheet: 36x4, radius 2, --border2. */}
              <span aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)' }} />
            </div>
          )}
          {children}
          {showCloseButton && (
            <DrawerPrimitive.Close
              aria-label="Close drawer"
              data-slot="drawer-close"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                display: 'grid',
                placeItems: 'center',
                minWidth: 44,
                minHeight: 44,
                padding: 6,
                border: 'none',
                borderRadius: 'var(--r-xs)',
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              <Icon name="close" size={18} />
            </DrawerPrimitive.Close>
          )}
        </DrawerPrimitive.Popup>
      </div>
    </DrawerPortal>
  )
})

export type DrawerHeaderProps = ComponentProps<'div'>

export const DrawerHeader = forwardRef<HTMLDivElement, DrawerHeaderProps>(function DrawerHeader(
  { className, style, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="drawer-header"
      className={cn(className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    />
  )
})

export type DrawerTitleProps = DrawerPrimitive.Title.Props

export const DrawerTitle = forwardRef<HTMLHeadingElement, DrawerTitleProps>(function DrawerTitle(
  { className, style, ...props },
  ref
) {
  return (
    <DrawerPrimitive.Title
      ref={ref}
      data-slot="drawer-title"
      className={resolveBaseUiClass(className)}
      style={{
        margin: 0,
        fontSize: 'var(--t-h3)',
        fontWeight: 700,
        color: 'var(--text)',
        ...style,
      }}
      {...props}
    />
  )
})

export type DrawerDescriptionProps = DrawerPrimitive.Description.Props

export const DrawerDescription = forwardRef<HTMLParagraphElement, DrawerDescriptionProps>(function DrawerDescription(
  { className, style, ...props },
  ref
) {
  return (
    <DrawerPrimitive.Description
      ref={ref}
      data-slot="drawer-description"
      className={resolveBaseUiClass(className)}
      style={{
        margin: '4px 0 0',
        fontSize: 'var(--t-meta)',
        color: 'var(--muted)',
        lineHeight: 1.5,
        ...style,
      }}
      {...props}
    />
  )
})

export type DrawerPanelProps = ComponentProps<'div'>

export const DrawerPanel = forwardRef<HTMLDivElement, DrawerPanelProps>(function DrawerPanel(
  { className, style, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="drawer-panel"
      className={cn(className)}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        padding: 20,
        ...style,
      }}
      {...props}
    />
  )
})

export type DrawerFooterProps = ComponentProps<'div'>

export const DrawerFooter = forwardRef<HTMLDivElement, DrawerFooterProps>(function DrawerFooter(
  { className, style, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="drawer-footer"
      className={cn(className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: 'var(--sp-md)',
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--card2)',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    />
  )
})
