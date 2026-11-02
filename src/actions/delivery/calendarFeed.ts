import { createAction } from '../core';
import { IS_MOCK, supabase } from '../../lib/supabase';
import type { SystemRole } from '../../types/database';

export type CreateCalendarFeedTokenOutput = {
  rawToken: string;
  feedUrl: string;
};

export const createCalendarFeedToken = createAction<Record<string, never>, CreateCalendarFeedTokenOutput>({
  name: 'createCalendarFeedToken',
  permissions: ['calendar_feed.create'],
  implemented: true,
  validate: () => {},
  execute: async (_input, ctx) => {
    if (IS_MOCK) {
      const rawToken = 'mock_calendar_feed_token_' + Date.now().toString(36)
      return {
        result: {
          rawToken,
          feedUrl: `${typeof window !== 'undefined' ? window.location.origin : 'https://app.babinrentals.com'}/calendar-feed?token=${rawToken}`,
        },
        events: [],
      };
    }

    const { data, error } = await supabase.rpc('create_calendar_feed_token');

    if (error) {
      throw new Error(`Failed to create calendar feed token: ${error.message}`);
    }

    const rawToken = data as string;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.babinrentals.com';

    return {
      result: {
        rawToken,
        feedUrl: `${origin}/calendar-feed?token=${rawToken}`,
      },
      events: [],
    };
  },
});

export type RevokeCalendarFeedTokenInput = {
  userId?: string;
};

export type RevokeCalendarFeedTokenOutput = {
  revoked: boolean;
};

export const revokeCalendarFeedToken = createAction<RevokeCalendarFeedTokenInput, RevokeCalendarFeedTokenOutput>({
  name: 'revokeCalendarFeedToken',
  permissions: ['calendar_feed.revoke'],
  implemented: true,
  validate: (input) => {
    if (input.userId !== undefined && typeof input.userId !== 'string') {
      throw new Error('User ID must be a string');
    }
  },
  execute: async (input, ctx) => {
    if (IS_MOCK) {
      return {
        result: { revoked: true },
        events: [],
      };
    }

    const { data, error } = await supabase.rpc('revoke_calendar_feed_token', {
      p_user_id: input.userId ?? null,
    });

    if (error) {
      throw new Error(`Failed to revoke calendar feed token: ${error.message}`);
    }

    return {
      result: { revoked: data as boolean },
      events: [],
    };
  },
});

export type GetCalendarFeedTokenStatusOutput = {
  hasToken: boolean;
  createdAt: string | null;
  revokedAt: string | null;
};

export const getCalendarFeedTokenStatus = createAction<Record<string, never>, GetCalendarFeedTokenStatusOutput>({
  name: 'getCalendarFeedTokenStatus',
  permissions: ['calendar_feed.view'],
  implemented: true,
  validate: () => {},
  execute: async (_input, ctx) => {
    if (IS_MOCK) {
      return { result: { hasToken: false, createdAt: null, revokedAt: null }, events: [] };
    }

    const { data, error } = await supabase
      .from('calendar_feed_tokens')
      .select('created_at, revoked_at')
      .eq('user_id', ctx.userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Failed to get calendar feed token status: ${error.message}`);
    }

    return {
      result: {
        hasToken: !!data,
        createdAt: data?.created_at ?? null,
        revokedAt: data?.revoked_at ?? null,
      },
      events: [],
    };
  },
});