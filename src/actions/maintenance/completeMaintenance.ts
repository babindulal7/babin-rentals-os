import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { safeUpdate, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type CompleteMaintenanceInput = {
  /** `maintenance_records.id` (UUID) or `record_no` (e.g. 'MNT-2026-0001'). */
  id: string;
  clientUuid?: string | undefined;
  note?: string | undefined;
  findings?: string | undefined;
  actionsTaken?: string | undefined;
  cost?: number | undefined;
  completedAt?: string | undefined;
  status?: 'Completed' | 'Cancelled' | undefined;
  unitCondition?: 'Good' | 'Excellent' | 'Fair' | undefined;
};

export type CompleteMaintenanceResult = {
  success: boolean;
  id: string;
  recordNo: string;
  status: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const completeMaintenanceConfig: ActionConfig<CompleteMaintenanceInput, CompleteMaintenanceResult> = {
  name: 'COMPLETE_MAINTENANCE',
  permissions: ['maintenance.complete'],
  implemented: true,

  validate: (input) => {
    if (!input.id || !input.id.trim()) {
      throw new Error('ID is required to complete maintenance.');
    }
    if (input.cost !== undefined && input.cost < 0) {
      throw new Error('Cost cannot be negative.');
    }
    const note = input.actionsTaken?.trim() || input.note?.trim();
    if (!note || note.length < 3) {
      throw new Error('A note/actions taken (minimum 3 characters) is required to close a maintenance job.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.id.trim();
    let resolvedId = rawId;
    let recordNo = rawId;

    if (UUID_RE.test(rawId)) {
      const { data, error } = await supabase
        .from('maintenance_records_v')
        .select('id, record_no, status')
        .eq('id', rawId)
        .maybeSingle();

      if (error || !data) {
        throw new Error(`Could not find maintenance record with ID: ${rawId}`);
      }
      resolvedId = data.id;
      recordNo = data.record_no;
    } else {
      const { data, error } = await supabase
        .from('maintenance_records_v')
        .select('id, record_no, status')
        .eq('record_no', rawId)
        .maybeSingle();

      if (error || !data) {
        throw new Error(`Could not find maintenance record with record number: ${rawId}`);
      }
      resolvedId = data.id;
      recordNo = data.record_no;
    }

    const actionUuid = input.clientUuid || generateClientUuid();
    const finalStatus = input.status || 'Completed';
    const completedAt = input.completedAt || new Date().toISOString();
    const note = (input.actionsTaken?.trim() || input.note?.trim())!;

    // Call server RPC if available (Ruling D4: close_maintenance_job marks damage repaired and recomputes status)
    if (typeof supabase.rpc === 'function') {
      const { data: rpcData, error: rpcError } = await supabase.rpc('close_maintenance_job', {
        p_maintenance_id: resolvedId,
        p_note: note,
        p_findings: input.findings?.trim() || null,
        p_actions_taken: note,
        p_cost: input.cost !== undefined ? Number(input.cost) : null,
        p_unit_condition: input.unitCondition ?? 'Good',
        p_client_uuid: actionUuid,
      });

      if (!rpcError && rpcData) {
        const events = [
          {
            type: EVENT_TYPES.MAINTENANCE_COMPLETED,
            payload: {
              id: resolvedId,
              recordNo,
              status: finalStatus,
              completedAt,
              timestamp: new Date().toISOString(),
              userId: ctx.userId,
            },
          },
        ];

        return {
          result: {
            success: true,
            id: resolvedId,
            recordNo,
            status: finalStatus,
          },
          events,
        };
      }
    }

    // Direct fallback path for environments without RPC
    const patch: Record<string, unknown> = {
      status: finalStatus,
      completed_at: completedAt,
      actions_taken: note,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    };

    if (input.findings !== undefined) {
      patch.findings = input.findings.trim() || null;
    }
    if (input.cost !== undefined) {
      patch.cost = Number(input.cost);
    }

    // Law 6: returnRow: false prevents 42501 permission error on revoked money column 'cost'
    await safeUpdate('maintenance_records' as never, resolvedId, patch as never, actionUuid, {
      returnRow: false,
    });

    const events = [
      {
        type: EVENT_TYPES.MAINTENANCE_COMPLETED,
        payload: {
          id: resolvedId,
          recordNo,
          status: finalStatus,
          completedAt,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        id: resolvedId,
        recordNo,
        status: finalStatus,
      },
      events,
    };
  },
};

export const completeMaintenance = createAction<CompleteMaintenanceInput, CompleteMaintenanceResult>(completeMaintenanceConfig);
