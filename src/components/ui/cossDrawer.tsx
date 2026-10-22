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
  { className, ...props },
  ref
) {
  return (
    <DrawerPrimitive.Backdrop
      ref={ref}
      data-slot="drawer-backdrop"
      className={resolveBaseUiClass(
        className,
        'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
        'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'
      )}
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

export const DrawerPopup = forwardRef<HTMLDivElement, DrawerPopupProps>(function DrawerPopup(
  { className, children, showBar = false, showCloseButton = true, container, ...props },
  ref
) {
  const { position } = useContext(DrawerContext)

  return (
    <DrawerPortal container={container}>
      <DrawerBackdrop />
      <div
        className={cn(
          'fixed inset-0 z-50 flex pointer-events-none',
          position === 'right' && 'justify-end',
          position === 'left' && 'justify-start',
          position === 'bottom' && 'items-end justify-center',
          position === 'top' && 'items-start justify-center'
        )}
      >
        <DrawerPrimitive.Popup
          ref={ref}
          data-slot="drawer-popup"
          className={resolveBaseUiClass(
            className,
            'pointer-events-auto relative flex flex-col bg-[var(--card)] text-[var(--text)] border-[var(--border)] shadow-2xl transition-transform duration-300 outline-none',
            position === 'right' && 'h-full w-full max-w-md sm:max-w-lg border-l data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full',
            position === 'left' && 'h-full w-full max-w-md sm:max-w-lg border-r data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full',
            position === 'bottom' && 'w-full max-h-[85vh] rounded-t-2xl border-t data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full',
            position === 'top' && 'w-full max-h-[85vh] rounded-b-2xl border-b data-[ending-style]:-translate-y-full data-[starting-style]:-translate-y-full'
          )}
          {...props}
        >
          {showBar && (
            <div className="flex justify-center pt-2.5 pb-1">
              <span className="h-1.5 w-12 rounded-full bg-[var(--muted)]/40" />
            </div>
          )}
          {children}
          {showCloseButton && (
            <DrawerPrimitive.Close
              aria-label="Close drawer"
              className="absolute top-3 right-3 p-2 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card2)] rounded-[var(--r-xs,4px)] min-w-[44px] min-h-[44px] grid place-items-center transition-colors"
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
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="drawer-header"
      className={cn('flex flex-col gap-1 px-6 pt-5 pb-3 border-b border-[var(--border)]', className)}
      {...props}
    />
  )
})

export type DrawerTitleProps = DrawerPrimitive.Title.Props

export const DrawerTitle = forwardRef<HTMLHeadingElement, DrawerTitleProps>(function DrawerTitle(
  { className, ...props },
  ref
) {
  return (
    <DrawerPrimitive.Title
      ref={ref}
      data-slot="drawer-title"
      className={resolveBaseUiClass(className, 'text-lg font-bold text-[var(--text)] tracking-tight')}
      {...props}
    />
  )
})

export type DrawerDescriptionProps = DrawerPrimitive.Description.Props

export const DrawerDescription = forwardRef<HTMLParagraphElement, DrawerDescriptionProps>(function DrawerDescription(
  { className, ...props },
  ref
) {
  return (
    <DrawerPrimitive.Description
      ref={ref}
      data-slot="drawer-description"
      className={resolveBaseUiClass(className, 'text-[var(--t-meta,13px)] text-[var(--muted,#9eaabb)]')}
      {...props}
    />
  )
})

export type DrawerPanelProps = ComponentProps<'div'>

export const DrawerPanel = forwardRef<HTMLDivElement, DrawerPanelProps>(function DrawerPanel(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="drawer-panel"
      className={cn('flex-1 overflow-y-auto px-6 py-4 overscroll-contain space-y-4', className)}
      {...props}
    />
  )
})

export type DrawerFooterProps = ComponentProps<'div'>

export const DrawerFooter = forwardRef<HTMLDivElement, DrawerFooterProps>(function DrawerFooter(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="drawer-footer"
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-6 py-4 border-t border-[var(--border)] bg-[var(--card2)]/40',
        className
      )}
      {...props}
    />
  )
})
