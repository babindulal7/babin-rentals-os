import { createAction, type ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type FailInspectionInput = {
  id: string;
};

export const failInspection = createAction<FailInspectionInput, { success: boolean }>({
  name: 'FAIL_INSPECTION',
  permissions: ['inspection.fail'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` fails closed when implemented: false (core.ts §1),
   * ensuring caller surfaces cannot mistake this for a live action. Flip to
   * `true` only when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.id || !input.id.trim()) throw new Error('ID is required.');
  },

  execute: async (input, ctx: ActionContext) => {
    const events = [
      {
        type: EVENT_TYPES.INSPECTION_FAILED,
        payload: {
          id: input.id,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true },
      events,
    };
  },
});
