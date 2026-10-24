import type { ReactNode } from 'react'
import {
  RheaCard,
  RheaCardHeader,
  RheaCardTitle,
  RheaCardDescription,
  RheaCardContent,
  RheaCardAction,
} from './RheaCard'

export interface RheaChartContainerProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function RheaChartContainer({
  title,
  description,
  action,
  children,
  className,
  style,
}: RheaChartContainerProps) {
  return (
    <RheaCard className={className} style={style}>
      <RheaCardHeader>
        <div>
          <RheaCardTitle>{title}</RheaCardTitle>
          {description && <RheaCardDescription>{description}</RheaCardDescription>}
        </div>
        {action && <RheaCardAction>{action}</RheaCardAction>}
      </RheaCardHeader>
      <RheaCardContent>{children}</RheaCardContent>
    </RheaCard>
  )
}
