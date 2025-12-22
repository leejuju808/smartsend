// Block 18: shouldSend() Gate Function
// SmartSend — Throttle & Warm-Up gate with suppression check

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ShouldSendResult {
  allowed: boolean
  reason?: string
  details?: {
    sent?: number
    cap?: number
    domain?: string
  }
}

/**
 * Check if we should send an email (throttle gate)
 * Uses should_send() database function for all checks:
 * - Suppression list
 * - Warm-up caps
 * - Domain throttling
 * - Per-account pacing
 */
export async function shouldSend(
  workspaceId: string,
  accountEmail: string,
  recipientEmail: string
): Promise<ShouldSendResult> {
  try {
    const { data, error } = await supabase.rpc('should_send', {
      p_workspace_id: workspaceId,
      p_account_email: accountEmail,
      p_recipient_email: recipientEmail,
    })

    if (error) {
      console.error('shouldSend error:', error)
      // Fail open for safety (allow send if check fails)
      return { allowed: true }
    }

    return data as ShouldSendResult
  } catch (error) {
    console.error('shouldSend exception:', error)
    // Fail open
    return { allowed: true }
  }
}

/**
 * Check if email is suppressed
 */
export async function isSuppressed(
  workspaceId: string,
  email: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('suppression_list')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (error) {
      console.error('isSuppressed error:', error)
      return false
    }

    return !!data
  } catch (error) {
    console.error('isSuppressed exception:', error)
    return false
  }
}

