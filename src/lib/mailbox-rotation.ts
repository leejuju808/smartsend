import { supabaseAdmin } from "@/server/supabase";

export interface Mailbox {
  id: string;
  name: string;
  from_email: string;
  from_name?: string;
  daily_cap: number;
  is_active: boolean;
}

export interface DeliverabilitySettings {
  default_domain_cap: number;
  send_window_start: string; // HH:MM format
  send_window_end: string; // HH:MM format
  timezone: string;
}

export interface DomainCap {
  domain: string;
  daily_cap: number;
}

/**
 * Get the least used active mailbox under its daily cap
 */
export async function getLeastUsedMailbox(
  userId: string,
  workspaceId?: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<Mailbox | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_least_used_mailbox', {
      p_user_id: userId,
      p_workspace_id: workspaceId || null,
      p_date: date
    });

    if (error) {
      console.error('Error getting least used mailbox:', error);
      return null;
    }

    if (!data) return null;

    // Get full mailbox details
    const { data: mailbox } = await supabaseAdmin
      .from('mailboxes')
      .select('*')
      .eq('id', data)
      .single();

    return mailbox;
  } catch (error) {
    console.error('Error in getLeastUsedMailbox:', error);
    return null;
  }
}

/**
 * Check if a domain is under its daily cap
 */
export async function checkDomainCap(
  userId: string,
  workspaceId: string | undefined,
  domain: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_domain_cap', {
      p_user_id: userId,
      p_workspace_id: workspaceId || null,
      p_domain: domain,
      p_date: date
    });

    if (error) {
      console.error('Error checking domain cap:', error);
      return false; // Fail safe - don't send if we can't verify
    }

    return data || false;
  } catch (error) {
    console.error('Error in checkDomainCap:', error);
    return false;
  }
}

/**
 * Increment mailbox daily usage counter
 */
export async function incrementMailboxUsage(
  mailboxId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('increment_mailbox_daily_usage', {
      p_mailbox_id: mailboxId,
      p_date: date,
      p_increment: 1
    });

    if (error) {
      console.error('Error incrementing mailbox usage:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in incrementMailboxUsage:', error);
    return 0;
  }
}

/**
 * Increment domain daily usage counter
 */
export async function incrementDomainUsage(
  userId: string,
  workspaceId: string | undefined,
  domain: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('increment_domain_daily_usage', {
      p_user_id: userId,
      p_workspace_id: workspaceId || null,
      p_domain: domain,
      p_date: date,
      p_increment: 1
    });

    if (error) {
      console.error('Error incrementing domain usage:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in incrementDomainUsage:', error);
    return 0;
  }
}

/**
 * Check if current time is within send window
 */
export function isWithinSendWindow(
  settings: DeliverabilitySettings,
  currentTime: Date = new Date()
): boolean {
  try {
    // Parse timezone and convert current time
    const tz = settings.timezone || 'UTC';
    const now = new Date(currentTime.toLocaleString('en-US', { timeZone: tz }));
    
    // Parse window times
    const [startHour, startMinute] = settings.send_window_start.split(':').map(Number);
    const [endHour, endMinute] = settings.send_window_end.split(':').map(Number);
    
    const startTime = new Date(now);
    startTime.setHours(startHour, startMinute, 0, 0);
    
    const endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);
    
    // Handle overnight windows (e.g., 22:00 to 06:00)
    if (startTime > endTime) {
      return now >= startTime || now <= endTime;
    }
    
    return now >= startTime && now <= endTime;
  } catch (error) {
    console.error('Error checking send window:', error);
    return true; // Fail safe - allow sending if we can't determine window
  }
}

/**
 * Get next send window time
 */
export function getNextSendWindowTime(
  settings: DeliverabilitySettings,
  currentTime: Date = new Date()
): Date {
  try {
    const tz = settings.timezone || 'UTC';
    const now = new Date(currentTime.toLocaleString('en-US', { timeZone: tz }));
    
    const [startHour, startMinute] = settings.send_window_start.split(':').map(Number);
    
    const nextWindow = new Date(now);
    nextWindow.setHours(startHour, startMinute, 0, 0);
    
    // If we're past today's start time, move to tomorrow
    if (nextWindow <= now) {
      nextWindow.setDate(nextWindow.getDate() + 1);
    }
    
    return nextWindow;
  } catch (error) {
    console.error('Error getting next send window:', error);
    // Fallback: schedule for tomorrow at 9 AM
    const tomorrow = new Date(currentTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  }
}

/**
 * Get deliverability settings for user/workspace
 */
export async function getDeliverabilitySettings(
  userId: string,
  workspaceId?: string
): Promise<DeliverabilitySettings | null> {
  try {
    const query = supabaseAdmin
      .from('deliverability_settings')
      .select('*')
      .eq('user_id', userId);

    if (workspaceId) {
      query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('Error getting deliverability settings:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getDeliverabilitySettings:', error);
    return null;
  }
}

/**
 * Get domain caps for user/workspace
 */
export async function getDomainCaps(
  userId: string,
  workspaceId?: string
): Promise<DomainCap[]> {
  try {
    const query = supabaseAdmin
      .from('domain_daily_caps')
      .select('domain, daily_cap')
      .eq('user_id', userId);

    if (workspaceId) {
      query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting domain caps:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getDomainCaps:', error);
    return [];
  }
}

/**
 * Get active mailboxes for user/workspace
 */
export async function getActiveMailboxes(
  userId: string,
  workspaceId?: string
): Promise<Mailbox[]> {
  try {
    const query = supabaseAdmin
      .from('mailboxes')
      .select('*')
      .eq('is_active', true)
      .eq('user_id', userId);

    if (workspaceId) {
      query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting active mailboxes:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getActiveMailboxes:', error);
    return [];
  }
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

/**
 * Check if we should reschedule due to send window
 */
export async function shouldRescheduleForSendWindow(
  userId: string,
  workspaceId?: string,
  currentTime: Date = new Date()
): Promise<{ shouldReschedule: boolean; nextSendTime?: Date }> {
  const settings = await getDeliverabilitySettings(userId, workspaceId);
  
  if (!settings) {
    return { shouldReschedule: false };
  }

  if (isWithinSendWindow(settings, currentTime)) {
    return { shouldReschedule: false };
  }

  const nextSendTime = getNextSendWindowTime(settings, currentTime);
  return { shouldReschedule: true, nextSendTime };
} 