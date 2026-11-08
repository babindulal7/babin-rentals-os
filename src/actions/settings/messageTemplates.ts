import { createAction, type ActionContext, type ActionConfig } from '../core'
import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'
import { canManageMessageTemplates } from '../../lib/rbac'

export type MessageTemplate = {
  id: string
  client_uuid: string
  template_key: string
  category: 'email' | 'document'
  name: string
  description: string | null
  version: number
  subject: string | null
  body: string
  allowed_placeholders: string[]
  is_active: boolean
  created_by: string | null
  created_at: string
}

export type SaveMessageTemplateInput = {
  templateKey: string
  subject?: string | null
  body: string
  clientUuid?: string
}

export type SaveMessageTemplateResult = {
  success: true
  template: MessageTemplate
}

export const saveMessageTemplateConfig: ActionConfig<SaveMessageTemplateInput, SaveMessageTemplateResult> = {
  name: 'SAVE_MESSAGE_TEMPLATE',
  // B20: Owner and Admin only
  permissions: ['settings.manage_templates'],
  implemented: true,

  validate: (input) => {
    if (!input.templateKey || !input.templateKey.trim()) {
      throw new Error('Template key is required.')
    }
    if (!input.body || input.body.trim().length < 5) {
      throw new Error('Template body must be at least 5 characters long.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (!canManageMessageTemplates(ctx.role)) {
      throw new Error(`Your role (${ctx.role}) cannot edit message templates. Only Owner and Admin can modify templates (B20).`)
    }

    const clientUuid = input.clientUuid || generateClientUuid()
    const { data, error } = await supabase.rpc('save_message_template', {
      p_client_uuid: clientUuid,
      p_template_key: input.templateKey.trim(),
      p_subject: input.subject?.trim() || null,
      p_body: input.body.trim(),
    })

    if (error) {
      throw new Error(`Failed to save message template: ${error.message}`)
    }

    const template = data as MessageTemplate

    return {
      result: {
        success: true,
        template,
      },
      events: [
        {
          type: 'MESSAGE_TEMPLATE_SAVED',
          payload: {
            id: template.id,
            templateKey: template.template_key,
            version: template.version,
            actorId: ctx.userId,
            clientUuid,
          },
        },
      ],
    }
  },
}

export const saveMessageTemplate = createAction<SaveMessageTemplateInput, SaveMessageTemplateResult>(saveMessageTemplateConfig)

export type RestoreMessageTemplateInput = {
  templateKey: string
  targetVersion: number
  clientUuid?: string
}

export type RestoreMessageTemplateResult = {
  success: true
  template: MessageTemplate
}

export const restoreMessageTemplateConfig: ActionConfig<RestoreMessageTemplateInput, RestoreMessageTemplateResult> = {
  name: 'RESTORE_MESSAGE_TEMPLATE',
  permissions: ['settings.manage_templates'],
  implemented: true,

  validate: (input) => {
    if (!input.templateKey || !input.templateKey.trim()) {
      throw new Error('Template key is required.')
    }
    if (!Number.isInteger(input.targetVersion) || input.targetVersion < 1) {
      throw new Error('Target version must be a positive integer.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (!canManageMessageTemplates(ctx.role)) {
      throw new Error(`Your role (${ctx.role}) cannot restore message templates. Only Owner and Admin can modify templates (B20).`)
    }

    const clientUuid = input.clientUuid || generateClientUuid()
    const { data, error } = await supabase.rpc('restore_message_template', {
      p_client_uuid: clientUuid,
      p_template_key: input.templateKey.trim(),
      p_target_version: input.targetVersion,
    })

    if (error) {
      throw new Error(`Failed to restore message template: ${error.message}`)
    }

    const template = data as MessageTemplate

    return {
      result: {
        success: true,
        template,
      },
      events: [
        {
          type: 'MESSAGE_TEMPLATE_RESTORED',
          payload: {
            id: template.id,
            templateKey: template.template_key,
            version: template.version,
            targetVersion: input.targetVersion,
            actorId: ctx.userId,
            clientUuid,
          },
        },
      ],
    }
  },
}

export const restoreMessageTemplate = createAction<RestoreMessageTemplateInput, RestoreMessageTemplateResult>(restoreMessageTemplateConfig)
