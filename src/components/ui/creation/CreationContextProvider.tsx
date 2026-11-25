/**
 * src/components/ui/creation/CreationContextProvider.tsx — Babin Rentals OS
 *
 * CreationContextProvider manages:
 * - Active module state and page contextual records (bookingNo, client, asset)
 * - Single-active-interface state machine (only one creation modal/drawer/wizard open at a time)
 * - Universal action execution and routing
 * - Draft preservation across nested workflows
 */

import { createContext, useContext, useEffect, useState, lazy, Suspense, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../lib/auth'
import { Modal } from '../Modal'
import { Button } from '../Button'
import {
  CREATION_ACTIONS,
  isCreationActionReady,
} from './CreationActionRegistry'

const QuickCreateDialog = lazy(() => import('./QuickCreateDialog').then(m => ({ default: m.QuickCreateDialog })))
const CreationDrawer = lazy(() => import('./CreationDrawer').then(m => ({ default: m.CreationDrawer })))
const CreationWizard = lazy(() => import('./CreationWizard').then(m => ({ default: m.CreationWizard })))
const CounterSaleModal = lazy(() => import('../../../modules/sales/CounterSaleModal').then(m => ({ default: m.CounterSaleModal })))

export interface CreationContextValue {
  activeModule: string
  contextData: Record<string, unknown>
  setActiveModule: (mod: string) => void
  setContextData: Dispatch<SetStateAction<Record<string, unknown>>>
  openCreationAction: (actionId: string, extraContext?: Record<string, unknown>) => void
  closeCreationAction: () => void
  activeActionId: string | null
}

const CreationContext = createContext<CreationContextValue | null>(null)

export function useCreationContext(): CreationContextValue {
  const ctx = useContext(CreationContext)
  if (!ctx) {
    throw new Error('useCreationContext must be used within a CreationContextProvider')
  }
  return ctx
}

export function useOptionalCreationContext(): CreationContextValue | null {
  return useContext(CreationContext)
}

/**
 * Convenient hook for pages to register their active module and contextual data
 * so GlobalAddMenu picks them up automatically.
 */
export function useRegisterCreationContext(
  module: string,
  contextData?: Record<string, unknown>
) {
  const ctx = useOptionalCreationContext()
  useEffect(() => {
    if (ctx) {
      ctx.setActiveModule(module)
      if (contextData) {
        ctx.setContextData(contextData)
      }
    }
  }, [ctx, module, contextData])
}

export function CreationContextProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [unavailable, setUnavailable] = useState<string | null>(null)
  // Empty until a page registers one; GlobalAddMenu then falls back to the route.
  const [activeModule, setActiveModule] = useState('')
  const [contextData, setContextData] = useState<Record<string, unknown>>({})
  const [activeActionId, setActiveActionId] = useState<string | null>(null)
  const [mergedContext, setMergedContext] = useState<Record<string, unknown>>({})

  const openCreationAction = (actionId: string, extraContext?: Record<string, unknown>) => {
    const act = CREATION_ACTIONS.find((a) => a.id === actionId)
    if (!act || !user || !act.isPermitted(user.role) || !isCreationActionReady(act)) {
      setUnavailable('This creation action is not available for your account or is not connected to a saved-record workflow. Nothing was created.')
      return
    }
    setUnavailable(null)

    const combined = { ...contextData, ...(extraContext ?? {}) }

    // If action specifies a dedicated route (e.g. /rentals?action=new) and we want route opening:
    if (act.openingMode === 'route' && act.route) {
      navigate(act.route)
      return
    }

    setMergedContext(combined)
    setActiveActionId(actionId)
  }

  const closeCreationAction = () => {
    setActiveActionId(null)
  }

  const activeAction = activeActionId
    ? CREATION_ACTIONS.find((a) => a.id === activeActionId)
    : null

  return (
    <CreationContext.Provider
      value={{
        activeModule,
        contextData,
        setActiveModule,
        setContextData,
        openCreationAction,
        closeCreationAction,
        activeActionId,
      }}
    >
      {children}

      {unavailable && (
        <Modal isOpen title="Creation unavailable" onClose={() => setUnavailable(null)}
          footer={<Button onClick={() => setUnavailable(null)}>Close</Button>}>
          <p role="alert">{unavailable}</p>
        </Modal>
      )}
      {/* Single-Active Creation Interface State Machine */}
      <Suspense fallback={null}>
        {activeAction && activeAction.openingMode === 'wizard' && (
          <CreationWizard
            isOpen={true}
            actionId={activeAction.id}
            contextData={mergedContext}
            onClose={closeCreationAction}
            onSuccess={() => closeCreationAction()}
          />
        )}

        {activeAction && activeAction.openingMode === 'drawer' && (
          <CreationDrawer
            isOpen={true}
            actionId={activeAction.id}
            contextData={mergedContext}
            onClose={closeCreationAction}
            onSuccess={() => closeCreationAction()}
          />
        )}

        {activeAction && activeAction.id === 'counter_sale.new' && (
          <CounterSaleModal
            isOpen={true}
            onClose={closeCreationAction}
            onSuccess={() => closeCreationAction()}
          />
        )}

        {activeAction && activeAction.id !== 'counter_sale.new' && (activeAction.openingMode === 'dialog' || activeAction.openingMode === 'modal') && (
          <QuickCreateDialog
            isOpen={true}
            actionId={activeAction.id}
            contextData={mergedContext}
            onClose={closeCreationAction}
            onSuccess={() => closeCreationAction()}
          />
        )}
      </Suspense>
    </CreationContext.Provider>
  )
}
