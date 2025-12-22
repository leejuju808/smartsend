/**
 * Block 24140 — Advanced Scheduler v2
 * Component 2: AI Timing Windows (Homeowner Behavior Timing)
 * 
 * SmartSend tracks when homeowners in this city open emails,
 * peak roofing engagement times, day-of-week patterns, storm-related attention spikes
 * 
 * Typical AI timing windows:
 * - 7:30–9:30 AM (homeowners check email at breakfast)
 * - 11:00 AM–1:00 PM (break time)
 * - 4:30–7:30 PM (after work)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const supabase = supabaseAdmin;

export type TimingWindowType = "morning" | "midday" | "evening" | "storm_spike";

export interface TimingWindow {
  windowType: TimingWindowType;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  engagementScore: number; // 0-100
}

/**
 * Get the best timing window for a lead based on their location and behavior patterns
 */
export async function getBestTimingWindow(
  leadId: string,
  preferredWindow?: TimingWindowType
): Promise<TimingWindow | null> {
  // Get lead location/timezone
  const { data: lead } = await supabase
    .from("leads")
    .select("timezone, city, state")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return null;
  }

  const timezone = lead.timezone || "America/Los_Angeles";
  const city = lead.city;
  const state = lead.state;

  // Query timing patterns (city-specific first, then fallback to global)
  let query = supabase
    .from("homeowner_timing_patterns")
    .select("*")
    .eq("timezone", timezone);

  if (city && state) {
    query = query.or(`and(city.eq.${city},state.eq.${state}),and(city.is.null,state.is.null)`);
  } else {
    query = query.is("city", null).is("state", null);
  }

  const { data: patterns } = await query
    .order("engagement_score", { ascending: false })
    .order("sample_size", { ascending: false });

  if (!patterns || patterns.length === 0) {
    // Fallback to default evening window
    return {
      windowType: "evening",
      startTime: "16:30",
      endTime: "19:30",
      engagementScore: 80.0,
    };
  }

  // Filter by preferred window if specified
  const filteredPatterns = preferredWindow
    ? patterns.filter((p) => p.window_type === preferredWindow)
    : patterns;

  const bestPattern = filteredPatterns[0] || patterns[0];

  return {
    windowType: bestPattern.window_type as TimingWindowType,
    startTime: bestPattern.peak_window_start,
    endTime: bestPattern.peak_window_end,
    engagementScore: bestPattern.engagement_score,
  };
}

/**
 * Calculate the next send time for a lead within their optimal timing window
 */
export async function getNextSendTime(
  leadId: string,
  preferredWindow?: TimingWindowType
): Promise<Date | null> {
  const window = await getBestTimingWindow(leadId, preferredWindow);
  if (!window) {
    return null;
  }

  // Get lead timezone
  const { data: lead } = await supabase
    .from("leads")
    .select("timezone")
    .eq("id", leadId)
    .single();

  const timezone = lead?.timezone || "America/Los_Angeles";

  // Parse window times
  const [startHour, startMin] = window.startTime.split(":").map(Number);
  const [endHour, endMin] = window.endTime.split(":").map(Number);

  // Get current time in lead's timezone
  const now = new Date();
  const localNow = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );

  // Calculate next occurrence of window start
  let nextSend = new Date(localNow);
  nextSend.setHours(startHour, startMin, 0, 0);

  // If window already passed today, move to tomorrow
  if (nextSend <= localNow) {
    nextSend.setDate(nextSend.getDate() + 1);
  }

  // Add some randomization (0-30 minutes) to avoid looking robotic
  const randomMinutes = Math.floor(Math.random() * 30);
  nextSend.setMinutes(nextSend.getMinutes() + randomMinutes);

  // Ensure we're still within the window
  const windowEnd = new Date(nextSend);
  windowEnd.setHours(endHour, endMin, 0, 0);

  if (nextSend > windowEnd) {
    // Move to next day's window
    nextSend.setDate(nextSend.getDate() + 1);
    nextSend.setHours(startHour, startMin, 0, 0);
    nextSend.setMinutes(nextSend.getMinutes() + randomMinutes);
  }

  // Convert back to UTC
  return nextSend;
}

/**
 * Record email engagement timing to learn patterns
 */
export async function recordEngagementTiming(
  leadId: string,
  emailSentAt: Date,
  openedAt?: Date,
  repliedAt?: Date
): Promise<void> {
  // Get lead info
  const { data: lead } = await supabase
    .from("leads")
    .select("timezone, city, state")
    .eq("id", leadId)
    .single();

  if (!lead) {
    return;
  }

  const timezone = lead.timezone || "America/Los_Angeles";
  const localSentAt = new Date(
    emailSentAt.toLocaleString("en-US", { timeZone: timezone })
  );

  const hourOfDay = localSentAt.getHours();
  const dayOfWeek = localSentAt.getDay();

  // Record engagement
  await supabase.from("email_engagement_timing").insert({
    lead_id: leadId,
    email_sent_at: emailSentAt.toISOString(),
    opened_at: openedAt?.toISOString(),
    replied_at: repliedAt?.toISOString(),
    city: lead.city,
    state: lead.state,
    timezone: timezone,
    hour_of_day: hourOfDay,
    day_of_week: dayOfWeek,
  });

  // Update timing patterns if we have enough data
  await updateTimingPatterns(lead.city, lead.state, timezone);
}

/**
 * Update timing patterns based on engagement data
 */
async function updateTimingPatterns(
  city: string | null,
  state: string | null,
  timezone: string
): Promise<void> {
  // Get engagement data for this location/timezone
  const { data: engagements } = await supabase
    .from("email_engagement_timing")
    .select("hour_of_day, opened_at, replied_at")
    .eq("timezone", timezone)
    .eq("city", city || "")
    .eq("state", state || "");

  if (!engagements || engagements.length < 10) {
    // Not enough data yet
    return;
  }

  // Group by hour and calculate engagement scores
  const hourScores: Record<number, { opens: number; replies: number; total: number }> = {};

  for (const eng of engagements) {
    const hour = eng.hour_of_day;
    if (!hourScores[hour]) {
      hourScores[hour] = { opens: 0, replies: 0, total: 0 };
    }
    hourScores[hour].total++;
    if (eng.opened_at) hourScores[hour].opens++;
    if (eng.replied_at) hourScores[hour].replies++;
  }

  // Find peak windows
  const windows: Array<{ start: number; end: number; type: TimingWindowType; score: number }> = [];

  // Morning window: 7-10 AM
  const morningScore = calculateWindowScore(hourScores, 7, 10);
  if (morningScore > 0) {
    windows.push({ start: 7, end: 10, type: "morning", score: morningScore });
  }

  // Midday window: 11 AM-1 PM
  const middayScore = calculateWindowScore(hourScores, 11, 13);
  if (middayScore > 0) {
    windows.push({ start: 11, end: 13, type: "midday", score: middayScore });
  }

  // Evening window: 4:30-7:30 PM
  const eveningScore = calculateWindowScore(hourScores, 16, 19);
  if (eveningScore > 0) {
    windows.push({ start: 16, end: 19, type: "evening", score: eveningScore });
  }

  // Update patterns
  for (const window of windows) {
    const startTime = `${window.start.toString().padStart(2, "0")}:30`;
    const endTime = `${window.end.toString().padStart(2, "0")}:30`;

    await supabase
      .from("homeowner_timing_patterns")
      .upsert(
        {
          city: city,
          state: state,
          timezone: timezone,
          peak_window_start: startTime,
          peak_window_end: endTime,
          window_type: window.type,
          engagement_score: window.score,
          sample_size: engagements.length,
          last_updated: new Date().toISOString(),
        },
        {
          onConflict: "city,state,timezone,window_type",
        }
      );
  }
}

function calculateWindowScore(
  hourScores: Record<number, { opens: number; replies: number; total: number }>,
  startHour: number,
  endHour: number
): number {
  let totalOpens = 0;
  let totalReplies = 0;
  let totalSends = 0;

  for (let hour = startHour; hour <= endHour; hour++) {
    const score = hourScores[hour];
    if (score) {
      totalSends += score.total;
      totalOpens += score.opens;
      totalReplies += score.replies;
    }
  }

  if (totalSends === 0) return 0;

  // Score = (open rate * 0.4 + reply rate * 0.6) * 100
  const openRate = totalOpens / totalSends;
  const replyRate = totalReplies / totalSends;
  return (openRate * 0.4 + replyRate * 0.6) * 100;
}

/**
 * Check if current time is within a send window for a lead
 */
export async function isWithinSendWindow(leadId: string): Promise<boolean> {
  const window = await getBestTimingWindow(leadId);
  if (!window) {
    return true; // Default to allowing sends if no window found
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("timezone")
    .eq("id", leadId)
    .single();

  const timezone = lead?.timezone || "America/Los_Angeles";
  const now = new Date();
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

  const [startHour, startMin] = window.startTime.split(":").map(Number);
  const [endHour, endMin] = window.endTime.split(":").map(Number);

  const windowStart = new Date(localNow);
  windowStart.setHours(startHour, startMin, 0, 0);

  const windowEnd = new Date(localNow);
  windowEnd.setHours(endHour, endMin, 0, 0);

  return localNow >= windowStart && localNow <= windowEnd;
}

