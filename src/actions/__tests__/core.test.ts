import { describe, it, expect, vi } from 'vitest'
import { createAction, ActionNotImplementedError, ActionPermissionError, ActionOfflineError } from '../core'
import type { SystemRole } from '../../types/database'

/**
 * The dispatcher's whole job now is to refuse. These assert the refusals,
 * because the failure they exist to prevent — an action reporting success for a
 * write it never made — is silent by construction and cannot be caught by
 * reading the screen.
 */
describe('createAction — fails closed', () => {
  const ctx = { userId: 'u-1', role: 'Owner' as const }

  it('refuses an action with no `implemented` flag, before validate or execute', async () => {
    const validate = vi.fn()
    const execute = vi.fn()
    const action = createAction({ name: 'STUB', permissions: [], validate, execute })

    await expect(action({}, ctx)).rejects.toBeInstanceOf(ActionNotImplementedError)
    // The point of the ordering: nothing observable ran.
    expect(validate).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses `implemented: false` explicitly, not just a missing flag', async () => {
    const action = createAction({
      name: 'STUB_EXPLICIT',
      permissions: [],
      implemented: false,
      validate: () => {},
      execute: async () => ({ result: { ok: true }, events: [] }),
    })
    await expect(action({}, ctx)).rejects.toBeInstanceOf(ActionNotImplementedError)
  })

  it('names the action in the error, so a report identifies which button lied', async () => {
    const action = createAction({
      name: 'RECORD_PAYMENT',
      permissions: [],
      validate: () => {},
      execute: async () => ({ result: null, events: [] }),
    })
    await expect(action({}, ctx)).rejects.toThrow(/RECORD_PAYMENT/)
  })

  it('refuses an implemented action called with no session context', async () => {
    const execute = vi.fn()
    const action = createAction({
      name: 'NEEDS_IDENTITY',
      permissions: [],
      implemented: true,
      validate: () => {},
      execute,
    })
    // The old dispatcher substituted `{ userId: 'system', role: 'admin' }` here.
    await expect(action({})).rejects.toThrow(/session context/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('denies a capability that has no defined rule, rather than waving it through', async () => {
    const execute = vi.fn()
    const action = createAction({
      name: 'UNKNOWN_CAPABILITY',
      permissions: ['some.capability.nobody.ruled'],
      implemented: true,
      validate: () => {},
      execute,
    })
    await expect(action({}, ctx)).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('denies payment.create to Warehouse — Law 6, through lib/rbac not a local matrix', async () => {
    const execute = vi.fn()
    const action = createAction({
      name: 'RECORD_PAYMENT',
      permissions: ['payment.create'],
      implemented: true,
      validate: () => {},
      execute,
    })
    await expect(action({}, { userId: 'u-2', role: 'Warehouse' })).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })

  /*
   * Until 15 Aug these four resolved to no rule and were denied for EVERY role,
   * Owner included — four implemented actions with real bodies that no session
   * could reach. PLAN.md §4.20. These assert both halves of the ruling: the
   * capability now resolves, and it resolves to the RLS role set rather than to
   * "anyone who asks".
   */
  describe('the four capabilities ruled 15 Aug 2026', () => {
    const reach = (capability: string, role: SystemRole) => {
      const execute = vi.fn(async () => ({ result: { ok: true }, events: [] }))
      const action = createAction({
        name: `PROBE_${capability}`,
        permissions: [capability],
        implemented: true,
        validate: () => {},
        execute,
      })
      return { run: () => action({}, { userId: 'u-1', role }), execute }
    }

    it.each(['rental.confirm', 'client.create', 'client.block', 'inventory.create'])(
      'resolves %s for Owner instead of denying it',
      async (capability) => {
        const { run, execute } = reach(capability, 'Owner')
        await expect(run()).resolves.toEqual({ ok: true })
        expect(execute).toHaveBeenCalled()
      },
    )

    it('admits Coordinator to rental.confirm — the seat that confirms bookings', async () => {
      const { run } = reach('rental.confirm', 'Coordinator')
      await expect(run()).resolves.toEqual({ ok: true })
    })

    it('still denies rental.confirm to Technician, whom the RLS policy excludes', async () => {
      const { run, execute } = reach('rental.confirm', 'Technician')
      await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
      expect(execute).not.toHaveBeenCalled()
    })

    it('denies client.block to Coordinator, who may create a client but not block one', async () => {
      const { run } = reach('client.create', 'Coordinator')
      await expect(run()).resolves.toEqual({ ok: true })

      const blocked = reach('client.block', 'Coordinator')
      await expect(blocked.run()).rejects.toBeInstanceOf(ActionPermissionError)
      expect(blocked.execute).not.toHaveBeenCalled()
    })

    /*
     * RULING 2026-10-22: client.change_membership mirrors client_memberships_all (0037).
     * It is a capability of its own because client.update is the booking-desk set, which admits
     * Warehouse (the walk-in desk), and client_memberships_all does not. Accounts have "no
     * membership edits" either (PERMISSIONS A5).
     */
    it.each(['Owner', 'Admin', 'Manager', 'Coordinator'] as const)('admits %s to client.change_membership', async (role) => {
      const { run, execute } = reach('client.change_membership', role)
      await expect(run()).resolves.toEqual({ ok: true })
      expect(execute).toHaveBeenCalled()
    })

    it.each(['Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as const)('denies client.change_membership to %s', async (role) => {
      const { run, execute } = reach('client.change_membership', role)
      await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
      expect(execute).not.toHaveBeenCalled()
    })

    it('is narrower than client.update, which admits Warehouse', async () => {
      const updated = reach('client.update', 'Warehouse')
      await expect(updated.run()).resolves.toEqual({ ok: true })
      const changed = reach('client.change_membership', 'Warehouse')
      await expect(changed.run()).rejects.toBeInstanceOf(ActionPermissionError)
    })

    it('denies inventory.create to Warehouse — bundles_manage, not bundle_items_all', async () => {
      const { run, execute } = reach('inventory.create', 'Warehouse')
      await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
      expect(execute).not.toHaveBeenCalled()
    })
  })

  /*
   * The 21 ruled 16 Aug 2026, closing the same trap for every capability that
   * had not sprung it yet. Derivation: CAPABILITY_MAPPING_2026-08-16.md §4.
   *
   * Grouped by role set rather than listed one-per-test, because four rules do
   * all the work and a flat list of 21 would hide that.
   */
  describe('the 21 capabilities ruled 16 Aug 2026', () => {
    const probe = (
      capability: string,
      role:
        | 'Owner'
        | 'Admin'
        | 'Manager'
        | 'Coordinator'
        | 'Accounts'
        | 'Warehouse'
        | 'Technician'
        | 'Driver'
        | 'Client',
      isOnline?: boolean,
    ) => {
      const execute = vi.fn(async () => ({ result: { ok: true }, events: [] }))
      const action = createAction({
        name: `PROBE_${capability}`,
        permissions: [capability],
        implemented: true,
        validate: () => {},
        execute,
      })
      return { run: () => action({}, { userId: 'u-1', role, ...(isOnline === undefined ? {} : { isOnline }) }), execute }
    }

    const DESK = [
      'rental.create',
      'rental.draft',
      'rental.cancel',
      'rental.extend',
      'client.update',
      'inventory.reserve',
      'document.create',
      'subrental.create',
      // T3-12 / 0223: the alias write rides the same five-role set as the
      // booking write it supports, so it is asserted with them (B-3).
      'inventory.edit_product_aliases',
    ]
    const FLOOR = [
      'rental.pickup',
      'rental.return',
      'inventory.pack',
      'inventory.ready',
      'inventory.audit',
      'inventory.transfer',
      'maintenance.create',
      'maintenance.complete',
      'evidence.review',
    ]
    const TRIAGE = ['case.resolve', 'crew.assign', 'purchase.approve']

    // T-1 / O16-3: lifecycle correction and archive are Manager+, online only.
    it.each(['rental.revert', 'rental.archive'])('%s is Manager+ online only', async capability => {
      for (const role of ['Owner', 'Admin', 'Manager'] as const) {
        await expect(probe(capability, role, true).run()).resolves.toEqual({ ok: true })
        await expect(probe(capability, role, false).run()).rejects.toBeInstanceOf(ActionOfflineError)
      }
      for (const role of ['Coordinator','Accounts','Warehouse','Technician','Driver','Client'] as const) {
        await expect(probe(capability, role, true).run()).rejects.toBeInstanceOf(ActionPermissionError)
      }
    })

    it.each(['Owner', 'Admin', 'Manager'] as const)('allows %s to adjust bulk stock', async (role) => {
      await expect(probe('inventory.stock_adjust', role, true).run()).resolves.toEqual({ ok: true })
    })

    it.each(['Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client'] as const)(
      'refuses %s a bulk stock adjustment', async (role) => {
        await expect(probe('inventory.stock_adjust', role).run()).rejects.toBeInstanceOf(ActionPermissionError)
      },
    )

    it.each([...DESK, ...FLOOR, ...TRIAGE, 'client.merge'])(
      'resolves %s for Owner instead of denying it',
      async (capability) => {
        const { run, execute } = probe(capability, 'Owner')
        await expect(run()).resolves.toEqual({ ok: true })
        expect(execute).toHaveBeenCalled()
      },
    )

    /* The A/B split, asserted at the dispatcher and not only in lib/rbac:
       Coordinator takes the booking, and does not touch the gear. */
    it.each(DESK)('admits Coordinator to %s — desk work', async (capability) => {
      await expect(probe(capability, 'Coordinator').run()).resolves.toEqual({ ok: true })
    })

    it.each(FLOOR)('denies Coordinator %s — floor work', async (capability) => {
      const { run, execute } = probe(capability, 'Coordinator')
      await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
      expect(execute).not.toHaveBeenCalled()
    })

    /* RULING 2026-09-08 (R-25) — `case.resolve` sets a damage disposition AND a
       cost, so it is a money write. It used to resolve to `isStaff()`, which
       admitted the three money-blind roles (P4, N-1). The suite above never
       caught it because TRIAGE is only asserted for Owner, and Owner passes
       under either rule. These lock the roles, not just the happy path. */
    const MONEY_BLIND_ROLES = ['Warehouse', 'Technician', 'Driver'] as const

    it.each(MONEY_BLIND_ROLES)(
      'denies %s case.resolve — a money-blind role may not price damage (P4/N-1)',
      async (role) => {
        const { run, execute } = probe('case.resolve', role)
        await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
        expect(execute).not.toHaveBeenCalled()
      },
    )

    it('admits Manager to case.resolve — PERMISSIONS.md §4.3 as corrected', async () => {
      await expect(probe('case.resolve', 'Manager').run()).resolves.toEqual({ ok: true })
    })

    it.each(['Admin', 'Coordinator', 'Accounts'] as const)(
      'denies %s case.resolve — the damage ladder is Owner · Manager, not M+',
      async (role) => {
        // §16 V-3: `auth_can_approve_damage()` refuses Admin at every amount,
        // identically in 0057 and on live. The doc's original "M+" was wrong.
        const { run } = probe('case.resolve', role)
        await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
      },
    )

    it('still admits every staff role to crew.assign — FILED, not fixed (R-25)', async () => {
      // Documents the known gap so the day it is narrowed to C+ this test fails
      // and is updated deliberately rather than by accident.
      await expect(probe('crew.assign', 'Warehouse').run()).resolves.toEqual({ ok: true })
    })

    it('denies client.merge to Warehouse, whom client.update admits', async () => {
      await expect(probe('client.update', 'Warehouse').run()).resolves.toEqual({ ok: true })
      await expect(probe('client.merge', 'Warehouse').run()).rejects.toBeInstanceOf(ActionPermissionError)
    })

    it('refuses the external Client every one of the 21', async () => {
      for (const capability of [...DESK, ...FLOOR, ...TRIAGE, 'client.merge']) {
        const { run, execute } = probe(capability, 'Client')
        await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
        expect(execute).not.toHaveBeenCalled()
      }
    })

    /*
     * The old pin here admitted Driver on purpose so an RLS narrowing would
     * fail loudly. It did: purchase_requests_approval_rank (0064, RESTRICTIVE)
     * went live 23 Aug 2026 and purchase.approve moved to canApprovePurchase —
     * the finance/admin five. Same pinning discipline, new rule.
     */
    it('denies Driver, Technician and Warehouse purchase.approve — 0064 live since 23 Aug 2026', async () => {
      for (const role of ['Driver', 'Technician', 'Warehouse'] as const) {
        const { run, execute } = probe('purchase.approve', role)
        await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
        expect(execute).not.toHaveBeenCalled()
      }
    })

    it('admits only Owner and Manager to purchase.approve — mirroring 0069', async () => {
      for (const role of ['Owner', 'Manager'] as const) {
        await expect(probe('purchase.approve', role).run()).resolves.toEqual({ ok: true })
      }
    })

    /*
     * 0069 (25 Aug 2026) narrowed past the money-visibility tier. These three
     * may SEE the cost and do every non-deciding verb, but landing the request
     * on Approved or Rejected is an owner/manager act.
     */
    it('denies Admin, Coordinator and Accounts purchase.approve — 0069 live since 25 Aug 2026', async () => {
      for (const role of ['Admin', 'Coordinator', 'Accounts'] as const) {
        const { run, execute } = probe('purchase.approve', role)
        await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
        expect(execute).not.toHaveBeenCalled()
      }
    })

    it('allows inspection.* to floor roles and denies to non-floor roles (PLAN.md §4.29, D3)', async () => {
      const floorRoles = ['Owner', 'Admin', 'Manager', 'Warehouse', 'Technician'] as const
      const nonFloorRoles = ['Driver', 'Accounts', 'Coordinator'] as const

      for (const capability of ['inspection.create', 'inspection.pass', 'inspection.fail']) {
        for (const role of floorRoles) {
          const { run, execute } = probe(capability, role)
          await expect(run()).resolves.toEqual({ ok: true })
          expect(execute).toHaveBeenCalledTimes(1)
        }

        for (const role of nonFloorRoles) {
          const { run, execute } = probe(capability, role)
          await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
          expect(execute).not.toHaveBeenCalled()
        }
      }
    })
  })

  it('runs an implemented, permitted action and emits its events after execute', async () => {
    const order: string[] = []
    const action = createAction<{ n: number }, { ok: true }>({
      name: 'REAL',
      permissions: ['money.view'],
      implemented: true,
      validate: () => {
        order.push('validate')
      },
      execute: async () => {
        order.push('execute')
        return { result: { ok: true as const }, events: [{ type: 'TEST_EVENT', payload: {} }] }
      },
    })

    await expect(action({ n: 1 }, ctx)).resolves.toEqual({ ok: true })
    expect(order).toEqual(['validate', 'execute'])
  })
})

/*
 * T4-07 · delivery zones (migration 0189, amended 3 Nov 2026).
 *
 * The T-1 round-trip for the three zone capabilities: the dispatcher must
 * resolve each to the role set in PERMISSIONS.md §4.10 and its RLS policy, not
 * to a broader default. Coordinator is the regression this pins — 0189 shipped
 * Coordinator+, the card's role set is Owner · Admin · Manager (build note 3),
 * and `checkCapability` had no case for these strings at all until T4-07.
 */
describe('delivery_zone capabilities — T-1 matrix round-trip (T4-07)', () => {
  const probe = (capability: string, role: SystemRole) => {
    const execute = vi.fn(async () => ({ result: { ok: true }, events: [] }))
    const action = createAction({
      name: `PROBE_${capability}`,
      permissions: [capability],
      implemented: true,
      validate: () => {},
      execute,
    })
    return { run: () => action({}, { userId: 'u-1', role }), execute }
  }

  const ZONE_WRITERS = ['Owner', 'Admin', 'Manager'] as const
  const NOT_ZONE_WRITERS = ['Coordinator', 'Accounts', 'Warehouse', 'Technician', 'Driver', 'Client'] as const

  it.each(['delivery_zone.create', 'delivery_zone.manage'] as const)(
    '%s admits exactly Owner · Admin · Manager',
    async (capability) => {
      for (const role of ZONE_WRITERS) {
        await expect(probe(capability, role).run()).resolves.toEqual({ ok: true })
      }
      for (const role of NOT_ZONE_WRITERS) {
        const { run, execute } = probe(capability, role)
        await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
        expect(execute).not.toHaveBeenCalled()
      }
    },
  )

  it('delivery_zone.read admits every staff role and refuses Client', async () => {
    const staff: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver']
    for (const role of staff) {
      await expect(probe('delivery_zone.read', role).run()).resolves.toEqual({ ok: true })
    }
    const { run, execute } = probe('delivery_zone.read', 'Client')
    await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('glossary.manage — T-1 Owner-only approval contract (T0-12/C-6)', () => {
  it('admits only Owner online and never executes another role or offline request', async () => {
    const roles: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
    for (const role of roles) {
      const execute = vi.fn(async () => ({ result: true, events: [] }))
      const probe = createAction({ name: 'GLOSSARY_PROBE', permissions: ['glossary.manage'], implemented: true, validate: () => {}, execute })
      if (role === 'Owner') await expect(probe({}, { userId: 'owner', role, isOnline: true })).resolves.toBe(true)
      else {
        await expect(probe({}, { userId: 'staff', role, isOnline: true })).rejects.toBeInstanceOf(ActionPermissionError)
        expect(execute).not.toHaveBeenCalled()
      }
    }
    const execute = vi.fn(async () => ({ result: true, events: [] }))
    const probe = createAction({ name: 'GLOSSARY_OFFLINE', permissions: ['glossary.manage'], implemented: true, validate: () => {}, execute })
    await expect(probe({}, { userId: 'owner', role: 'Owner', isOnline: false })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('problem_report capabilities — T-1 matrix round-trip (T4-11)', () => {
  const probe = (capability: string, role: SystemRole) => {
    const execute = vi.fn(async () => ({ result: { ok: true }, events: [] }))
    const action = createAction({
      name: `PROBE_${capability}`,
      permissions: [capability],
      implemented: true,
      validate: () => {},
      execute,
    })
    return {
      run: () => action({}, { userId: 'u-1', role, isOnline: true }),
      execute,
    }
  }

  it('problem_report.create admits all staff and refuses Client', async () => {
    const staff: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver']
    for (const role of staff) {
      await expect(probe('problem_report.create', role).run()).resolves.toEqual({ ok: true })
    }
    const { run, execute } = probe('problem_report.create', 'Client')
    await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('problem_report.read admits all staff and refuses Client', async () => {
    const staff: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver']
    for (const role of staff) {
      await expect(probe('problem_report.read', role).run()).resolves.toEqual({ ok: true })
    }
    const { run, execute } = probe('problem_report.read', 'Client')
    await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('problem_report.manage admits exactly Owner and Admin', async () => {
    for (const role of ['Owner', 'Admin'] as const) {
      await expect(probe('problem_report.manage', role).run()).resolves.toEqual({ ok: true })
    }
    for (const role of ['Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client'] as const) {
      const { run, execute } = probe('problem_report.manage', role)
      await expect(run()).rejects.toBeInstanceOf(ActionPermissionError)
      expect(execute).not.toHaveBeenCalled()
    }
  })
})

/**
 * ## The guard that should have existed first
 *
 * Every capability gap so far — the four found on 15 Aug, the 24 on 16 Aug —
 * was found by a person grepping `permissions:` arrays against the switch. Both
 * times the gap had been sitting there for days, and the second time only the
 * first four had bodies, which is the only reason it was survivable.
 *
 * The defect is invisible by construction: a declared-but-unhandled capability
 * falls to `default: undefined`, which the dispatcher reads as a denial, so the
 * symptom is "your role cannot do this" for **every role including Owner** —
 * a permission error whose true cause is a missing `case`. Nothing in the type
 * system connects the two files, so nothing else can catch it.
 *
 * This reads the source rather than importing it, deliberately: the failure is
 * a mismatch between two files, and only a text comparison of both sees it.
 *
 * `import.meta.glob` rather than `node:fs` because `@types/node` is not a
 * dependency and `tsconfig` carries no `"types": ["node"]` — adding one to
 * satisfy a test would widen the whole program's global scope. Vite's glob is
 * already typed here via `src/vite-env.d.ts`.
 */
describe('every declared capability resolves to a rule', () => {
  /* Eager + ?raw gives path → file text at transform time. The pattern reaches
     every action, at any nesting depth; the `__tests__` filter keeps this
     file's own probe strings out of the declared set. */
  const sources: Record<string, string> = import.meta.glob('../**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  const actionSources = Object.entries(sources).filter(([path]) => !path.includes('__tests__'))

  /**
   * Closed 2026-09-12 per PLAN.md §4.29(a) and migration 0122.
   * All declared capabilities under src/actions now resolve to an RBAC rule.
   */
  const KNOWN_OPEN: string[] = []

  /**
   * Comments must come out before either scan.
   *
   * Found by mutation-testing this guard on 16 Aug 2026: commenting out
   * `case 'inventory.transfer':` left the guard green, because `// case 'x':`
   * still matches the pattern. A commented-out case is *exactly* the shape of
   * the bug — the capability stops resolving while the text still says it does —
   * so the one mutation most likely to happen in practice was the one this
   * could not see. Both scans strip first now, and both the block-comment and
   * line-comment forms are removed since `core.ts` documents each ruling in a
   * `/* *\/` block that names capabilities in prose.
   */
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  const declared = (): string[] => {
    const found = new Set<string>()
    for (const [, source] of actionSources) {
      for (const array of stripComments(source).matchAll(/permissions:\s*\[([^\]]*)\]/g)) {
        for (const literal of (array[1] ?? '').matchAll(/'([^']+)'/g)) {
          if (literal[1]) found.add(literal[1])
        }
      }
    }
    return [...found].sort()
  }

  const handled = (): string[] => {
    const source = actionSources.find(([path]) => path.endsWith('/core.ts'))?.[1]
    if (!source) throw new Error('core.ts was not matched by the glob — the pattern is wrong')
    return [...stripComments(source).matchAll(/case '([^']+)':/g)].map((m) => m[1] as string).sort()
  }

  it('finds the capability declarations at all — the scan is not vacuously passing', () => {
    /* A regex that silently matched nothing would make every assertion below
       pass while checking nothing. Pin a floor and two known members. */
    const all = declared()
    expect(all.length).toBeGreaterThan(25)
    expect(all).toContain('rental.confirm')
    expect(all).toContain('purchase.approve')
  })

  it('leaves no capability declared under src/actions unhandled by checkCapability', () => {
    const unhandled = declared().filter((c) => !handled().includes(c))
    expect(unhandled).toEqual(KNOWN_OPEN.slice().sort())
  })

  it('handles no capability that nothing declares, beyond the app-level rules', () => {
    /* Rules the app states rather than capabilities an action asks for.
       Anything else handled-but-undeclared is a dead `case` or a renamed
       capability that left its old spelling behind.

       ⚠ `money.view` was in the prose here and missing from the list, so this
       assertion failed on a capability the comment itself called app-level. It
       is the Law 6 read gate — `lib/moneyVisibility` and every screen that hides
       a figure call it, and no action declares it, by design. Added 16 Aug 2026.
       The payment pair IS declared (`recordPayment`, `refundPayment`), so it
       correctly stays out of this list. */
    const APP_LEVEL = [
      'credit.override',
      'invoice.void',
      'money.view',
      'settings.manage',
      'inspection.create',
      'inspection.pass',
      'inspection.fail',
      'offer_campaign.manage',
      'comms.templates',
    ]
    const orphaned = handled().filter((c) => !declared().includes(c) && !APP_LEVEL.includes(c))
    expect(orphaned).toEqual([])
  })
})
