// Block 24900 — Follow-Up Brain v2: Behavior-Adaptive Timing Engine
// Optimizes send times based on homeowner behavior patterns

import { supabaseAdmin } from "@/server/supabase";

export interface BehaviorPattern {
  leadId: string;
  openTimes: Date[];
  replyTimes: Date[];
  avgReplyDelayHours: number;
  preferredHours: number[];
  preferredDays: number[];
  timezone?: string;
  behaviorScore: number;
}

/**
 * Updates behavior pattern based on email open/reply
 */
export async function updateBehaviorPattern(
  leadId: string,
  event: {
    type: 'open' | 'reply';
    timestamp: Date;
    timezone?: string;
  }
): Promise<void> {
  try {
    // Get or create behavior pattern
    const { data: existing } = await supabaseAdmin
      .from('homeowner_behavior_patterns')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    const now = event.timestamp;
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday

    if (existing) {
      // Update existing pattern
      const openTimes = event.type === 'open' 
        ? [...(existing.open_times || []), now.toISOString()]
        : existing.open_times || [];
      
      const replyTimes = event.type === 'reply'
        ? [...(existing.reply_times || []), now.toISOString()]
        : existing.reply_times || [];

      // Calculate average reply delay
      let avgReplyDelayHours = existing.avg_reply_delay_hours;
      if (event.type === 'reply' && openTimes.length > 0) {
        // Find most recent open before this reply
        const recentOpens = openTimes
          .map(t => new Date(t))
          .filter(t => t < now)
          .sort((a, b) => b.getTime() - a.getTime());
        
        if (recentOpens.length > 0) {
          const delayHours = (now.getTime() - recentOpens[0].getTime()) / (1000 * 60 * 60);
          const existingDelays = existing.reply_times?.length || 0;
          avgReplyDelayHours = existingDelays > 0
            ? (avgReplyDelayHours * existingDelays + delayHours) / (existingDelays + 1)
            : delayHours;
        }
      }

      // Update preferred hours (most common hour)
      const allHours = [
        ...(existing.open_times || []).map(t => new Date(t).getHours()),
        ...(existing.reply_times || []).map(t => new Date(t).getHours()),
        hour,
      ];
      const hourCounts = allHours.reduce((acc, h) => {
        acc[h] = (acc[h] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      const preferredHours = Object.entries(hourCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([h]) => parseInt(h));

      // Update preferred days
      const allDays = [
        ...(existing.open_times || []).map(t => new Date(t).getDay()),
        ...(existing.reply_times || []).map(t => new Date(t).getDay()),
        day,
      ];
      const dayCounts = allDays.reduce((acc, d) => {
        acc[d] = (acc[d] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      const preferredDays = Object.entries(dayCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([d]) => parseInt(d));

      // Calculate behavior score (0-1)
      const behaviorScore = calculateBehaviorScore({
        openCount: openTimes.length,
        replyCount: replyTimes.length,
        avgDelay: avgReplyDelayHours || 0,
        lastActivity: now,
      });

      await supabaseAdmin
        .from('homeowner_behavior_patterns')
        .update({
          open_times: openTimes,
          reply_times: replyTimes,
          avg_reply_delay_hours: avgReplyDelayHours,
          preferred_hours: preferredHours,
          preferred_days: preferredDays,
          timezone: event.timezone || existing.timezone,
          last_activity_at: now.toISOString(),
          behavior_score: behaviorScore,
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId);
    } else {
      // Create new pattern
      const openTimes = event.type === 'open' ? [now.toISOString()] : [];
      const replyTimes = event.type === 'reply' ? [now.toISOString()] : [];

      await supabaseAdmin
        .from('homeowner_behavior_patterns')
        .insert({
          lead_id: leadId,
          open_times: openTimes,
          reply_times: replyTimes,
          preferred_hours: [hour],
          preferred_days: [day],
          timezone: event.timezone,
          last_activity_at: now.toISOString(),
          behavior_score: 0.5, // Default
        });
    }
  } catch (error) {
    console.error('Error updating behavior pattern:', error);
  }
}

/**
 * Calculates optimal send time based on behavior pattern
 */
export async function calculateOptimalSendTime(
  leadId: string,
  baseTime: Date = new Date()
): Promise<Date> {
  try {
    const { data: pattern } = await supabaseAdmin
      .from('homeowner_behavior_patterns')
      .select('*')
      .eq('lead_id', leadId)
      .single();

    if (!pattern) {
      // Default: send in 2 hours during business hours
      const sendTime = new Date(baseTime);
      sendTime.setHours(sendTime.getHours() + 2);
      if (sendTime.getHours() < 9) {
        sendTime.setHours(9, 0, 0, 0);
      } else if (sendTime.getHours() >= 17) {
        sendTime.setDate(sendTime.getDate() + 1);
        sendTime.setHours(9, 0, 0, 0);
      }
      return sendTime;
    }

    // Use preferred hour if available
    if (pattern.preferred_hours && pattern.preferred_hours.length > 0) {
      const preferredHour = pattern.preferred_hours[0];
      const sendTime = new Date(baseTime);
      sendTime.setHours(preferredHour, 0, 0, 0);
      
      // If preferred hour has passed today, schedule for tomorrow
      if (sendTime < baseTime) {
        sendTime.setDate(sendTime.getDate() + 1);
      }
      
      return sendTime;
    }

    // Use average reply delay
    if (pattern.avg_reply_delay_hours) {
      const sendTime = new Date(baseTime);
      sendTime.setHours(
        sendTime.getHours() + Math.round(pattern.avg_reply_delay_hours)
      );
      return sendTime;
    }

    // Default: 2 hours
    const sendTime = new Date(baseTime);
    sendTime.setHours(sendTime.getHours() + 2);
    return sendTime;
  } catch (error) {
    console.error('Error calculating optimal send time:', error);
    const sendTime = new Date(baseTime);
    sendTime.setHours(sendTime.getHours() + 2);
    return sendTime;
  }
}

/**
 * Calculates behavior score (0-1)
 */
function calculateBehaviorScore(data: {
  openCount: number;
  replyCount: number;
  avgDelay: number;
  lastActivity: Date;
}): number {
  const { openCount, replyCount, avgDelay, lastActivity } = data;
  
  // Base score from engagement
  let score = Math.min(1, (openCount * 0.1 + replyCount * 0.3) / 10);
  
  // Boost for fast replies (lower delay = higher score)
  if (avgDelay > 0) {
    const delayScore = Math.max(0, 1 - (avgDelay / 48)); // 48 hours = 0 score
    score = (score + delayScore) / 2;
  }
  
  // Recency boost
  const hoursSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1 - (hoursSinceActivity / 168)); // 1 week = 0 score
  score = (score + recencyScore) / 2;
  
  return Math.max(0, Math.min(1, score));
}






































