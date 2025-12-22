/**
 * Behavior Tracker
 * Records email opens, replies, and sends for Smart Send learning
 */

import { createClient } from '@supabase/supabase-js';
import { recordEngagement } from './algorithm';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Track email open event
 */
export async function trackEmailOpen(
  workspaceId: string,
  emailLogId: string,
  leadId?: string
): Promise<void> {
  try {
    // Get lead ZIP code
    let zipcode: string | null = null;
    if (leadId) {
      const { data: location } = await supabase
        .from('lead_locations')
        .select('zipcode')
        .eq('lead_id', leadId)
        .single();

      zipcode = location?.zipcode || null;
    }

    // Record engagement
    if (zipcode) {
      await recordEngagement(workspaceId, zipcode, 'open');
    }

    // Update email log if it exists
    const { data: emailLog } = await supabase
      .from('email_logs')
      .select('id, opened_at')
      .eq('id', emailLogId)
      .single();

    if (emailLog && !emailLog.opened_at) {
      await supabase
        .from('email_logs')
        .update({ opened_at: new Date().toISOString() })
        .eq('id', emailLogId);
    }
  } catch (error) {
    console.error('Error tracking email open:', error);
  }
}

/**
 * Track email reply event
 */
export async function trackEmailReply(
  workspaceId: string,
  emailLogId: string,
  leadId?: string
): Promise<void> {
  try {
    // Get lead ZIP code
    let zipcode: string | null = null;
    if (leadId) {
      const { data: location } = await supabase
        .from('lead_locations')
        .select('zipcode')
        .eq('lead_id', leadId)
        .single();

      zipcode = location?.zipcode || null;
    }

    // Record engagement
    if (zipcode) {
      await recordEngagement(workspaceId, zipcode, 'reply');
    }

    // Update email log if it exists
    const { data: emailLog } = await supabase
      .from('email_logs')
      .select('id, replied_at')
      .eq('id', emailLogId)
      .single();

    if (emailLog && !emailLog.replied_at) {
      await supabase
        .from('email_logs')
        .update({ replied_at: new Date().toISOString() })
        .eq('id', emailLogId);
    }
  } catch (error) {
    console.error('Error tracking email reply:', error);
  }
}

/**
 * Track email send event
 */
export async function trackEmailSend(
  workspaceId: string,
  leadId: string,
  email: string
): Promise<void> {
  try {
    // Get lead ZIP code
    const { data: location } = await supabase
      .from('lead_locations')
      .select('zipcode')
      .eq('lead_id', leadId)
      .single();

    const zipcode = location?.zipcode || null;

    // Record engagement
    if (zipcode) {
      await recordEngagement(workspaceId, zipcode, 'send');
    }
  } catch (error) {
    console.error('Error tracking email send:', error);
  }
}

/**
 * Batch update behavior data from email tracking events
 */
export async function syncBehaviorFromEmailLogs(
  workspaceId: string,
  since?: Date
): Promise<void> {
  try {
    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    // Get email logs with opens/replies
    const { data: emailLogs } = await supabase
      .from('email_logs')
      .select('id, lead_id, opened_at, replied_at, sent_at')
      .gte('sent_at', sinceDate.toISOString())
      .or('opened_at.not.is.null,replied_at.not.is.null');

    if (!emailLogs || emailLogs.length === 0) {
      return;
    }

    // Get lead IDs
    const leadIds = emailLogs
      .map((log) => log.lead_id)
      .filter((id): id is string => !!id);

    // Get ZIP codes for all leads
    const { data: locations } = await supabase
      .from('lead_locations')
      .select('lead_id, zipcode')
      .in('lead_id', leadIds);

    const zipcodeMap = new Map(
      locations?.map((l) => [l.lead_id, l.zipcode]) || []
    );

    // Process each email log
    for (const log of emailLogs) {
      const zipcode = zipcodeMap.get(log.lead_id);
      if (!zipcode) continue;

      if (log.opened_at) {
        const openDate = new Date(log.opened_at);
        await recordEngagement(workspaceId, zipcode, 'open');
      }

      if (log.replied_at) {
        const replyDate = new Date(log.replied_at);
        await recordEngagement(workspaceId, zipcode, 'reply');
      }

      if (log.sent_at) {
        await recordEngagement(workspaceId, zipcode, 'send');
      }
    }
  } catch (error) {
    console.error('Error syncing behavior from email logs:', error);
  }
}



























