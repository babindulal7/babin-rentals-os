import * as React from 'react'

export interface RheaCardProps extends React.ComponentProps<'div'> {
  size?: 'default' | 'sm'
}

export function RheaCard({
  className,
  size = 'default',
  style,
  children,
  ...props
}: RheaCardProps) {
  const combinedClassName = className ? `rhea-card ${className}` : 'rhea-card'
  return (
    <div
      data-slot="card"
      data-size={size}
      className={combinedClassName}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}

export function RheaCardHeader({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const combinedClassName = className ? `rhea-card-header ${className}` : 'rhea-card-header'
  return (
    <div
      data-slot="card-header"
      className={combinedClassName}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}

export function RheaCardTitle({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'h3'>) {
  const combinedClassName = className ? `rhea-card-title ${className}` : 'rhea-card-title'
  return (
    <h3
      data-slot="card-title"
      className={combinedClassName}
      style={style}
      {...props}
    >
      {children}
    </h3>
  )
}

export function RheaCardDescription({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'p'>) {
  const combinedClassName = className ? `rhea-card-description ${className}` : 'rhea-card-description'
  return (
    <p
      data-slot="card-description"
      className={combinedClassName}
      style={style}
      {...props}
    >
      {children}
    </p>
  )
}

export function RheaCardAction({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const combinedClassName = className ? `rhea-card-action ${className}` : 'rhea-card-action'
  return (
    <div
      data-slot="card-action"
      className={combinedClassName}
      style={{ justifySelf: 'end', alignSelf: 'start', ...style }}
      {...props}
    >
      {children}
    </div>
  )
}

export function RheaCardContent({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const combinedClassName = className ? `rhea-card-content ${className}` : 'rhea-card-content'
  return (
    <div
      data-slot="card-content"
      className={combinedClassName}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}

export function RheaCardFooter({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const combinedClassName = className ? `rhea-card-footer ${className}` : 'rhea-card-footer'
  return (
    <div
      data-slot="card-footer"
      className={combinedClassName}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}
