// lib/inbox-rotation.ts
// Inbox Rotation Engine - Block 425
// Picks the best inbox for rotation based on health score and daily usage

import { SupabaseClient } from "@supabase/supabase-js";

export interface InboxPoolItem {
  id: string;
  daily_limit: number;
  inbox_health?: {
    score: number;
    bounce_rate: number;
    spam_rate: number;
  };
}

/**
 * Fetches inbox pool for a domain and filters healthy inboxes
 */
export async function getInboxPool(
  supabase: SupabaseClient,
  domainId: string
): Promise<InboxPoolItem[]> {
  const { data: inboxPool, error } = await supabase
    .from("sender_inboxes")
    .select(`
      id,
      daily_limit,
      inbox_health (
        score,
        bounce_rate,
        spam_rate
      )
    `)
    .eq("domain_id", domainId)
    .eq("connected", true);

  if (error || !inboxPool) {
    return [];
  }

  return inboxPool as InboxPoolItem[];
}

/**
 * Filters out unhealthy inboxes based on health thresholds
 */
export function filterHealthyInboxes(
  inboxPool: InboxPoolItem[]
): InboxPoolItem[] {
  const healthy = inboxPool.filter(
    (i) =>
      (i.inbox_health?.score ?? 0) >= 30 &&
      (i.inbox_health?.spam_rate ?? 0) <= 0.01 &&
      (i.inbox_health?.bounce_rate ?? 0) <= 0.05
  );

  // If none are healthy, fallback to all inboxes
  return healthy.length > 0 ? healthy : inboxPool;
}

/**
 * Gets today's send usage per inbox
 */
export async function getTodayUsage(
  supabase: SupabaseClient,
  inboxIds: string[],
  todayStart: Date
): Promise<Map<string, number>> {
  if (inboxIds.length === 0) {
    return new Map();
  }

  const { data: usage, error } = await supabase
    .from("email_events")
    .select("sender_inbox_id")
    .eq("event_type", "sent")
    .in("sender_inbox_id", inboxIds)
    .gte("created_at", todayStart.toISOString());

  if (error || !usage) {
    return new Map();
  }

  // Count usage per inbox
  const usageMap = new Map<string, number>();
  for (const item of usage) {
    if (item.sender_inbox_id) {
      const current = usageMap.get(item.sender_inbox_id) || 0;
      usageMap.set(item.sender_inbox_id, current + 1);
    }
  }

  return usageMap;
}

/**
 * Calculates rotation score for an inbox
 * Formula: weight_health * health_score - weight_volume * usage_today
 */
export function calculateRotationScore(
  inbox: InboxPoolItem,
  usageToday: number,
  weightHealth: number = 2,
  weightVolume: number = 1
): number {
  const healthScore = inbox.inbox_health?.score ?? 50;
  return weightHealth * healthScore - weightVolume * usageToday;
}

/**
 * Picks the best inbox for rotation
 * Uses the pick_rotation_inbox database function if available, otherwise falls back to client-side logic
 * Now considers team inbox assignments (Block 442)
 */
export async function pickRotationInbox(
  supabase: SupabaseClient,
  domainId: string,
  userId?: string,
  todayStart: Date = new Date(new Date().setHours(0, 0, 0, 0))
): Promise<string | null> {
  // Get current user if not provided
  let currentUserId = userId;
  if (!currentUserId) {
    const { data: { user } } = await supabase.auth.getUser();
    currentUserId = user?.id;
  }

  // Try to use database function first (more efficient, includes assignment filtering)
  const { data: dbInboxId, error: dbError } = await supabase.rpc(
    "pick_rotation_inbox",
    {
      p_domain_id: domainId,
      p_user_id: currentUserId || null,
      p_today_start: todayStart.toISOString(),
    }
  );

  if (!dbError && dbInboxId) {
    return dbInboxId;
  }

  // Fallback to client-side logic (filter by assignments if user_id available)
  const inboxPool = await getInboxPool(supabase, domainId);
  if (inboxPool.length === 0) {
    return null;
  }

  // Filter by assignments if user_id is available
  let eligibleInboxes = inboxPool;
  if (currentUserId) {
    // Check which inboxes are available to this user
    const { data: availableInboxes } = await supabase.rpc(
      "get_user_available_inboxes",
      {
        p_user_id: currentUserId,
      }
    );

    if (availableInboxes && availableInboxes.length > 0) {
      const availableIds = new Set(availableInboxes.map((i: any) => i.inbox_id));
      eligibleInboxes = inboxPool.filter((i) => availableIds.has(i.id));
    }
  }

  if (eligibleInboxes.length === 0) {
    return null;
  }

  const healthy = filterHealthyInboxes(eligibleInboxes);
  if (healthy.length === 0) {
    return null;
  }

  const inboxIds = healthy.map((i) => i.id);
  const usageMap = await getTodayUsage(supabase, inboxIds, todayStart);

  // Score each inbox and pick the best one
  let bestScore = -Infinity;
  let bestInbox: InboxPoolItem | null = null;

  for (const inbox of healthy) {
    const usageToday = usageMap.get(inbox.id) || 0;
    const score = calculateRotationScore(inbox, usageToday);

    if (score > bestScore) {
      bestScore = score;
      bestInbox = inbox;
    }
  }

  return bestInbox?.id || null;
}

