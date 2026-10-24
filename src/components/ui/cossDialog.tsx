import { forwardRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from '../../lib/cn'
import { useViewport } from '../../lib/device'
import Icon from './Icon'

type ClassProp<T> = string | ((state: T) => string | undefined) | undefined

function resolveBaseUiClass<T>(userClass: ClassProp<T>, ...baseClasses: (string | boolean | undefined | null)[]): ClassProp<T> {
  if (typeof userClass === 'function') {
    return (state: T) => cn(...baseClasses, userClass(state))
  }
  return cn(...baseClasses, userClass)
}

/*
 * coss-compliant Dialog, composed over Base UI's Dialog primitives with the
 * app's real inline-style + CSS-variable system. Complements cossDrawer with
 * theme-token paint (--scrim, --z-modal, --card, --border2, --shadow-modal).
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogPortal = DialogPrimitive.Portal

export type DialogBackdropProps = DialogPrimitive.Backdrop.Props

export const DialogBackdrop = forwardRef<HTMLDivElement, DialogBackdropProps>(function DialogBackdrop(
  { className, style, ...props },
  ref
) {
  return (
    <DialogPrimitive.Backdrop
      ref={ref}
      data-slot="dialog-backdrop"
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

export interface DialogPopupProps extends DialogPrimitive.Popup.Props {
  showCloseButton?: boolean
  bottomStickOnMobile?: boolean
  container?: HTMLElement | ShadowRoot | { current: HTMLElement | ShadowRoot | null } | null | undefined
  children?: ReactNode
}

export const DialogPopup = forwardRef<HTMLDivElement, DialogPopupProps>(function DialogPopup(
  { className, children, showCloseButton = true, bottomStickOnMobile = true, container, style, ...props },
  ref
) {
  const viewport = useViewport()
  const isMobileSheet = bottomStickOnMobile && viewport === 'phone'

  return (
    <DialogPortal container={container}>
      <DialogBackdrop />
      <div
        className={cn(
          'coss-dialog__wrapper',
          bottomStickOnMobile && 'coss-dialog__wrapper--bottom-stick'
        )}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-modal)' as unknown as number,
          display: 'flex',
          alignItems: isMobileSheet ? 'flex-end' : 'center',
          justifyContent: 'center',
          padding: isMobileSheet ? 0 : 'var(--sp-md)',
          pointerEvents: 'none',
        }}
      >
        <DialogPrimitive.Popup
          ref={ref}
          data-slot="dialog-popup"
          className={resolveBaseUiClass(
            className,
            'coss-dialog__popup',
            bottomStickOnMobile && 'coss-dialog__popup--bottom-stick'
          )}
          style={{
            pointerEvents: 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: isMobileSheet ? '100%' : 520,
            maxHeight: '85dvh',
            borderRadius: isMobileSheet ? '16px 16px 0 0' : 'var(--r-card, 12px)',
            border: isMobileSheet ? 'none' : '1px solid var(--border2)',
            borderTop: '1px solid var(--border2)',
            background: 'var(--card)',
            color: 'var(--text)',
            boxShadow: 'var(--shadow-modal)',
            overflow: 'hidden',
            outline: 'none',
            ...style,
          }}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              aria-label="Close dialog"
              data-slot="dialog-close"
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
                borderRadius: 'var(--r-xs, 4px)',
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              <Icon name="close" size={18} />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </div>
    </DialogPortal>
  )
})

export type DialogHeaderProps = ComponentProps<'div'>

export const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(function DialogHeader(
  { className, style, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
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

export type DialogTitleProps = DialogPrimitive.Title.Props

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(function DialogTitle(
  { className, style, ...props },
  ref
) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
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

export type DialogDescriptionProps = DialogPrimitive.Description.Props

export const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(function DialogDescription(
  { className, style, ...props },
  ref
) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
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

export type DialogPanelProps = ComponentProps<'div'>

export const DialogPanel = forwardRef<HTMLDivElement, DialogPanelProps>(function DialogPanel(
  { className, style, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-panel"
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

export interface DialogFooterProps extends ComponentProps<'div'> {
  variant?: 'default' | 'bare'
}

export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(function DialogFooter(
  { className, variant = 'default', style, ...props },
  ref
) {
  const viewport = useViewport()
  const isPhone = viewport === 'phone'

  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn('coss-dialog__footer', className)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: 'var(--sp-md)',
        paddingTop: 16,
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: isPhone ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : 16,
        ...(variant === 'default'
          ? {
              borderTop: '1px solid var(--border)',
              background: 'var(--card2)',
            }
          : {}),
        flexShrink: 0,
        ...style,
      }}
      {...props}
    />
  )
})
