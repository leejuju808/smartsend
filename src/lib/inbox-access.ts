/**
 * Block 19750 — Inbox Access Control
 * Helper functions for checking inbox access based on beta_access_level
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type BetaAccessLevel = 'internal' | 'alpha' | 'beta' | 'founders' | 'public';

export interface InboxAccessResult {
  hasAccess: boolean;
  accessLevel: BetaAccessLevel | null;
  inboxEnabled: boolean;
}

/**
 * Check if current user has inbox access
 * Uses the has_inbox_access() database function
 */
export async function checkInboxAccess(userId?: string): Promise<InboxAccessResult> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // If no userId provided, try to get current user
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { hasAccess: false, accessLevel: null, inboxEnabled: false };
      }
      userId = user.id;
    }

    // Call database function to check access
    const { data, error } = await supabase.rpc('has_inbox_access', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error checking inbox access:', error);
      return { hasAccess: false, accessLevel: null, inboxEnabled: false };
    }

    // Also get the access level for UI purposes
    const { data: profile } = await supabase
      .from('profiles')
      .select('inbox_enabled, beta_access_level')
      .eq('id', userId)
      .single();

    return {
      hasAccess: data === true,
      accessLevel: (profile?.beta_access_level as BetaAccessLevel) || null,
      inboxEnabled: profile?.inbox_enabled || false,
    };
  } catch (error) {
    console.error('Error checking inbox access:', error);
    return { hasAccess: false, accessLevel: null, inboxEnabled: false };
  }
}

/**
 * Server-side function to check inbox access
 * Use this in API routes and server components
 */
export async function checkInboxAccessServer(userId: string): Promise<InboxAccessResult> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-side
    );

    const { data, error } = await supabase.rpc('has_inbox_access', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error checking inbox access:', error);
      return { hasAccess: false, accessLevel: null, inboxEnabled: false };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('inbox_enabled, beta_access_level')
      .eq('id', userId)
      .single();

    return {
      hasAccess: data === true,
      accessLevel: (profile?.beta_access_level as BetaAccessLevel) || null,
      inboxEnabled: profile?.inbox_enabled || false,
    };
  } catch (error) {
    console.error('Error checking inbox access:', error);
    return { hasAccess: false, accessLevel: null, inboxEnabled: false };
  }
}

/**
 * Check if access level allows inbox access
 */
export function isAccessLevelAllowed(accessLevel: BetaAccessLevel | null): boolean {
  if (!accessLevel) return false;
  return ['internal', 'alpha', 'beta', 'founders'].includes(accessLevel);
}

/**
 * Get display name for access level
 */
export function getAccessLevelDisplayName(accessLevel: BetaAccessLevel | null): string {
  switch (accessLevel) {
    case 'internal':
      return 'Internal Testing';
    case 'alpha':
      return 'Alpha Access';
    case 'beta':
      return 'Beta Access';
    case 'founders':
      return 'Founders Beta';
    case 'public':
      return 'Public';
    default:
      return 'No Access';
  }
}



















































