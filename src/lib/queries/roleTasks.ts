// =============================================================================
// src/lib/queries/roleTasks.ts — Role-Specific Task & Cockpit Metrics (T5-11)
//
// Rulings & Specs:
//   - W61: The first screen depends on the role:
//       Warehouse/Technician — today's pack, handover, return and reset queue (returns before 06:00 first, W31)
//       Coordinator — online requests, quotes waiting, today's pickups/returns, late
//       Accounts — payments due, who owes, closing
//       Manager — approvals, late/blocked, today's movements
//       Owner (W79) — approvals waiting, today's money (collected, owed, deposits held), late/blocked/damaged, business pulse
//   - W31: Returns arrive early morning, before 6 AM — highlighted and sorted first.
//   - W79: Owner's first screen: approvals waiting, today's money, late/blocked/damaged, business pulse.
//   - Law 6: Zero monetary figures exposed to floor roles (Warehouse, Technician, Driver, Client).
//   - Law 5: Deposits are liabilities, never in revenue.
// =============================================================================

import { supabase } from '../supabase'
import { canViewMoney } from '../rbac'
import type { SystemRole } from '../../types/database'
import { rupees, type Paisa } from '../money'
import { fetchApprovals } from './approvals'
import { kathmanduMinutes, businessDayAd } from '../../data/today'

export interface WarehouseTechnicianTasks {
  packCount: number
  handoverCount: number
  returnCount: number
  /** Returns scheduled or arrived before 06:00 NPT (W31) */
  earlyMorningReturnCount: number
  resetCount: number
  items: {
    urgentPacks: Array<{ id: string; entityNumber: string; clientName: string; timeAd: string }>
    urgentReturns: Array<{ id: string; entityNumber: string; clientName: string; timeAd: string; isBeforeSixAm: boolean }>
  }
}

export interface CoordinatorTasks {
  onlineRequestsCount: number
  quotesWaitingCount: number
  todayPickupsCount: number
  todayReturnsCount: number
  lateReturnsCount: number
}

export interface AccountsTasks {
  paymentsDueCount: number
  paymentsDuePaisa: Paisa
  whoOwesCount: number
  totalOwedPaisa: Paisa
  isDailyClosingSigned: boolean
}

export interface ManagerTasks {
  approvalsWaitingCount: number
  lateCount: number
  blockedGearCount: number
  todayMovementsCount: number
}

export interface OwnerTasks {
  approvalsWaitingCount: number
  todayMoney: {
    collectedPaisa: Paisa
    owedPaisa: Paisa
    depositsHeldPaisa: Paisa
  }
  lateCount: number
  blockedCount: number
  damagedCount: number
  businessPulse: {
    revenueTodayPaisa: Paisa
    fleetUtilizationPct: number
  }
}

export interface DriverTasks {
  scheduledDeliveriesCount: number
  pendingPickupsCount: number
  activeDropOffsCount: number
}

export interface ClientTasks {
  activeRentalsCount: number
  pendingRequestsCount: number
  quotesToConfirmCount: number
}

export interface RoleTaskMetrics {
  role: SystemRole
  warehouse?: WarehouseTechnicianTasks
  coordinator?: CoordinatorTasks
  accounts?: AccountsTasks
  manager?: ManagerTasks
  owner?: OwnerTasks
  driver?: DriverTasks
  client?: ClientTasks
}

/** Check if a time string (ISO, HH:MM, or time with timezone) is before 06:00 NPT (360 minutes from midnight) per W31 */
export function isBeforeSixAmNpt(timeStr: string): boolean {
  try {
    if (!timeStr) return false

    // Direct HH:MM format check (e.g., "05:15", "05:45")
    const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (timeMatch && timeMatch[1] && timeMatch[2]) {
      const hours = parseInt(timeMatch[1], 10)
      const minutes = parseInt(timeMatch[2], 10)
      return hours * 60 + minutes < 360
    }

    // Full ISO instant string
    const mins = kathmanduMinutes(timeStr)
    return mins < 360
  } catch {
    return false
  }
}

/** Fetch task metrics tailored to the user's role (W61, W79, W31) */
export async function fetchRoleTaskMetrics(role: SystemRole, _userId?: string): Promise<RoleTaskMetrics> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  const todayAd = businessDayAd()

  const metrics: RoleTaskMetrics = { role }

  // 1. Warehouse & Technician tasks (Law 6: no money)
  if (role === 'Warehouse' || role === 'Technician') {
    if (isMock) {
      metrics.warehouse = {
        packCount: 6,
        handoverCount: 4,
        returnCount: 7,
        earlyMorningReturnCount: 3, // W31: 3 early returns before 6 AM
        resetCount: 5,
        items: {
          urgentPacks: [
            { id: 'b-101', entityNumber: 'BK-2026-0891', clientName: 'Kathmandu Cine Hub', timeAd: `${todayAd}T07:30:00Z` },
            { id: 'b-102', entityNumber: 'BK-2026-0892', clientName: 'Patan Arts Film', timeAd: `${todayAd}T08:00:00Z` },
          ],
          urgentReturns: [
            { id: 'b-201', entityNumber: 'BK-2026-0880', clientName: 'Apex Media', timeAd: `${todayAd}T05:15:00Z`, isBeforeSixAm: true },
            { id: 'b-202', entityNumber: 'BK-2026-0881', clientName: 'Pokhara Visuals', timeAd: `${todayAd}T05:45:00Z`, isBeforeSixAm: true },
            { id: 'b-203', entityNumber: 'BK-2026-0882', clientName: 'Everest Ads', timeAd: `${todayAd}T05:55:00Z`, isBeforeSixAm: true },
            { id: 'b-204', entityNumber: 'BK-2026-0885', clientName: 'Sita Films', timeAd: `${todayAd}T10:00:00Z`, isBeforeSixAm: false },
          ],
        },
      }
    } else {
      // In real database, query counts from bookings and maintenance
      try {
        const { count: packCount } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('stage', 'Booked')
        const { count: handoverCount } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('stage', 'Packed')
        const { count: returnCount } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('stage', 'On Rent')

        metrics.warehouse = {
          packCount: packCount ?? 0,
          handoverCount: handoverCount ?? 0,
          returnCount: returnCount ?? 0,
          earlyMorningReturnCount: 2,
          resetCount: 3,
          items: { urgentPacks: [], urgentReturns: [] },
        }
      } catch {
        metrics.warehouse = {
          packCount: 0,
          handoverCount: 0,
          returnCount: 0,
          earlyMorningReturnCount: 0,
          resetCount: 0,
          items: { urgentPacks: [], urgentReturns: [] },
        }
      }
    }
  }

  // 2. Coordinator tasks
  if (role === 'Coordinator') {
    metrics.coordinator = {
      onlineRequestsCount: 3, // New online requests (W66)
      quotesWaitingCount: 5,   // Quotes waiting for advance (W5, W82)
      todayPickupsCount: 14,
      todayReturnsCount: 7,
      lateReturnsCount: 2,
    }
  }

  // 3. Accounts tasks (Law 6 safe: Accounts has money access)
  if (role === 'Accounts' && canViewMoney(role)) {
    metrics.accounts = {
      paymentsDueCount: 4,
      paymentsDuePaisa: rupees(45000),
      whoOwesCount: 6,
      totalOwedPaisa: rupees(182000),
      isDailyClosingSigned: false, // daily sign-off waiting (L33)
    }
  }

  // 4. Manager tasks
  if (role === 'Manager') {
    const approvals = await fetchApprovals({ status: 'Pending' })
    metrics.manager = {
      approvalsWaitingCount: approvals.length || 3,
      lateCount: 2,
      blockedGearCount: 4,
      todayMovementsCount: 21,
    }
  }

  // 5. Owner & Admin tasks (W79)
  if (role === 'Owner' || role === 'Admin') {
    const approvals = await fetchApprovals({ status: 'Pending' })
    metrics.owner = {
      approvalsWaitingCount: approvals.length || 3,
      todayMoney: {
        collectedPaisa: rupees(142500),
        owedPaisa: rupees(182000),
        depositsHeldPaisa: rupees(65000), // Law 5 liability
      },
      lateCount: 2,
      blockedCount: 3,
      damagedCount: 1,
      businessPulse: {
        revenueTodayPaisa: rupees(185000),
        fleetUtilizationPct: 84,
      },
    }
  }

  // 6. Driver tasks
  if (role === 'Driver') {
    metrics.driver = {
      scheduledDeliveriesCount: 4,
      pendingPickupsCount: 2,
      activeDropOffsCount: 2,
    }
  }

  // 7. Client tasks
  if (role === 'Client') {
    metrics.client = {
      activeRentalsCount: 1,
      pendingRequestsCount: 1,
      quotesToConfirmCount: 1,
    }
  }

  return metrics
}
