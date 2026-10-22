import { forwardRef } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from '../../lib/cn'
import Icon from './Icon'

type ClassProp<T> = string | ((state: T) => string | undefined) | undefined

function resolveBaseUiClass<T>(userClass: ClassProp<T>, ...baseClasses: (string | boolean | undefined | null)[]): ClassProp<T> {
  if (typeof userClass === 'function') {
    return (state: T) => cn(...baseClasses, userClass(state))
  }
  return cn(...baseClasses, userClass)
}

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export const DialogPortal = DialogPrimitive.Portal

export type DialogBackdropProps = DialogPrimitive.Backdrop.Props

export const DialogBackdrop = forwardRef<HTMLDivElement, DialogBackdropProps>(function DialogBackdrop(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Backdrop
      ref={ref}
      data-slot="dialog-backdrop"
      className={resolveBaseUiClass(
        className,
        'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200',
        'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'
      )}
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
  { className, children, showCloseButton = true, bottomStickOnMobile = true, container, ...props },
  ref
) {
  return (
    <DialogPortal container={container}>
      <DialogBackdrop />
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6',
          bottomStickOnMobile && 'max-sm:items-end max-sm:p-0'
        )}
      >
        <DialogPrimitive.Popup
          ref={ref}
          data-slot="dialog-popup"
          className={resolveBaseUiClass(
            className,
            'relative flex flex-col w-full max-w-lg max-h-[90vh] rounded-[var(--r-card,12px)] border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-xl overflow-hidden',
            'transition-all duration-200 outline-none',
            'data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            bottomStickOnMobile && 'max-sm:max-w-none max-sm:max-h-[85vh] max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0'
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="absolute top-3 right-3 p-2 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--card2)] rounded-[var(--r-xs,4px)] min-w-[44px] min-h-[44px] grid place-items-center transition-colors"
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
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 px-6 pt-6 pb-3 border-b border-[var(--border)]', className)}
      {...props}
    />
  )
})

export type DialogTitleProps = DialogPrimitive.Title.Props

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(function DialogTitle(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={resolveBaseUiClass(className, 'text-lg font-bold text-[var(--text)] tracking-tight')}
      {...props}
    />
  )
})

export type DialogDescriptionProps = DialogPrimitive.Description.Props

export const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(function DialogDescription(
  { className, ...props },
  ref
) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={resolveBaseUiClass(className, 'text-[var(--t-meta,13px)] text-[var(--muted,#9eaabb)] leading-normal')}
      {...props}
    />
  )
})

export type DialogPanelProps = ComponentProps<'div'>

export const DialogPanel = forwardRef<HTMLDivElement, DialogPanelProps>(function DialogPanel(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-panel"
      className={cn('flex-1 overflow-y-auto px-6 py-4 overscroll-contain space-y-4', className)}
      {...props}
    />
  )
})

export interface DialogFooterProps extends ComponentProps<'div'> {
  variant?: 'default' | 'bare'
}

export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(function DialogFooter(
  { className, variant = 'default', ...props },
  ref
) {
  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-6 py-4',
        variant === 'default' && 'border-t border-[var(--border)] bg-[var(--card2)]/40',
        className
      )}
      {...props}
    />
  )
})
