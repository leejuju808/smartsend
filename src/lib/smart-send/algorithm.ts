/**
 * Smart Send Algorithm
 * Analyzes behavior data to select optimal send times for maximum engagement
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SendTimeRecommendation {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  hour: number; // 0-23
  score: number; // 0-1, higher is better
  openRate: number;
  replyRate: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface SmartSendConfig {
  workspaceId: string;
  zipcode?: string;
  minHour?: number;
  maxHour?: number;
  daysOfWeek?: number[];
  minDataPoints?: number;
}

/**
 * Get best send times based on historical behavior
 */
export async function getBestSendTimes(
  config: SmartSendConfig
): Promise<SendTimeRecommendation[]> {
  const {
    workspaceId,
    zipcode,
    minHour = 9,
    maxHour = 17,
    daysOfWeek = [1, 2, 3, 4, 5], // Mon-Fri
    minDataPoints = 10,
  } = config;

  // Build query
  let query = supabase
    .from('open_behavior')
    .select('day_of_week, hour, open_rate, reply_rate, sends')
    .eq('workspace_id', workspaceId)
    .gte('hour', minHour)
    .lte('hour', maxHour)
    .gte('sends', minDataPoints);

  if (zipcode) {
    query = query.eq('zipcode', zipcode);
  }

  if (daysOfWeek.length > 0) {
    query = query.in('day_of_week', daysOfWeek);
  }

  const { data, error } = await query.order('sends', { ascending: false });

  if (error) {
    console.error('Error fetching send times:', error);
    return getDefaultSendTimes(minHour, maxHour, daysOfWeek);
  }

  if (!data || data.length === 0) {
    // No data yet, return default times
    return getDefaultSendTimes(minHour, maxHour, daysOfWeek);
  }

  // Calculate scores and rank
  const recommendations: SendTimeRecommendation[] = data.map((row) => {
    const score = row.open_rate * 0.6 + row.reply_rate * 0.4;
    const confidence = getConfidence(row.sends, score);

    return {
      dayOfWeek: row.day_of_week,
      hour: row.hour,
      score,
      openRate: row.open_rate,
      replyRate: row.reply_rate,
      confidence,
    };
  });

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, 10); // Top 10
}

/**
 * Get default send times when no data is available
 */
function getDefaultSendTimes(
  minHour: number,
  maxHour: number,
  daysOfWeek: number[]
): SendTimeRecommendation[] {
  // Industry best practices for roofing emails
  const defaultHours = [9, 10, 11, 14, 15, 16]; // Best hours for B2C
  const defaultDays = daysOfWeek.length > 0 ? daysOfWeek : [1, 2, 3, 4, 5];

  return defaultDays.flatMap((day) =>
    defaultHours
      .filter((h) => h >= minHour && h <= maxHour)
      .map((hour) => ({
        dayOfWeek: day,
        hour,
        score: 0.5, // Neutral score for defaults
        openRate: 0.25, // Industry average
        replyRate: 0.05, // Industry average
        confidence: 'low' as const,
      }))
  );
}

/**
 * Determine confidence level based on data points and score
 */
function getConfidence(
  dataPoints: number,
  score: number
): 'high' | 'medium' | 'low' {
  if (dataPoints >= 50 && score >= 0.3) return 'high';
  if (dataPoints >= 20 && score >= 0.2) return 'medium';
  return 'low';
}

/**
 * Select optimal send time for a specific ZIP code
 */
export async function selectOptimalSendTime(
  workspaceId: string,
  zipcode: string,
  config?: Partial<SmartSendConfig>
): Promise<{ dayOfWeek: number; hour: number } | null> {
  const recommendations = await getBestSendTimes({
    workspaceId,
    zipcode,
    ...config,
  });

  if (recommendations.length === 0) {
    return null;
  }

  // Prefer high-confidence recommendations
  const highConf = recommendations.find((r) => r.confidence === 'high');
  if (highConf) {
    return {
      dayOfWeek: highConf.dayOfWeek,
      hour: highConf.hour,
    };
  }

  // Fall back to best score
  const best = recommendations[0];
  return {
    dayOfWeek: best.dayOfWeek,
    hour: best.hour,
  };
}

/**
 * Record email engagement for behavior learning
 */
export async function recordEngagement(
  workspaceId: string,
  zipcode: string | null,
  eventType: 'open' | 'reply' | 'send',
  deviceType?: 'mobile' | 'desktop' | 'tablet'
): Promise<void> {
  if (!zipcode) return;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  // Use direct upsert instead of RPC for more control
  if (eventType === 'send') {
    // Increment sends count
    const { error } = await supabase
      .from('open_behavior')
      .upsert(
        {
          workspace_id: workspaceId,
          zipcode,
          day_of_week: dayOfWeek,
          hour,
          sends: 1,
          opens: 0,
          replies: 0,
        },
        {
          onConflict: 'workspace_id,zipcode,day_of_week,hour',
          ignoreDuplicates: false,
        }
      )
      .select();

    if (error) {
      // If upsert fails, try update
      const { error: updateError } = await supabase.rpc('increment_behavior_sends', {
        p_workspace_id: workspaceId,
        p_zipcode: zipcode,
        p_day_of_week: dayOfWeek,
        p_hour: hour,
      });

      if (updateError) {
        console.error('Error recording send:', updateError);
      }
    }
  } else {
    // Record open or reply using RPC
    const { error } = await supabase.rpc('record_email_engagement', {
      p_workspace_id: workspaceId,
      p_zipcode: zipcode,
      p_day_of_week: dayOfWeek,
      p_hour: hour,
      p_event_type: eventType,
    });

    if (error) {
      console.error(`Error recording ${eventType}:`, error);
    }
  }
}

/**
 * Get ZIP code hotspots (best performing ZIP codes)
 */
export async function getZipcodeHotspots(
  workspaceId: string,
  limit: number = 10
): Promise<Array<{ zipcode: string; openRate: number; replyRate: number; sends: number }>> {
  const { data, error } = await supabase
    .from('open_behavior')
    .select('zipcode, open_rate, reply_rate, sends')
    .eq('workspace_id', workspaceId)
    .gte('sends', 20) // Minimum data threshold
    .order('open_rate', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching ZIP hotspots:', error);
    return [];
  }

  return (
    data?.map((row) => ({
      zipcode: row.zipcode || '',
      openRate: row.open_rate,
      replyRate: row.reply_rate,
      sends: row.sends,
    })) || []
  );
}

/**
 * Calculate recommended send rate based on deliverability and engagement
 */
export async function getRecommendedSendRate(
  workspaceId: string,
  domainReputation?: 'excellent' | 'good' | 'fair' | 'poor'
): Promise<number> {
  // Base rate on domain reputation
  const baseRates = {
    excellent: 100, // emails per hour
    good: 50,
    fair: 25,
    poor: 10,
  };

  const baseRate = baseRates[domainReputation || 'fair'];

  // Adjust based on recent engagement
  const { data } = await supabase
    .from('open_behavior')
    .select('open_rate, reply_rate')
    .eq('workspace_id', workspaceId)
    .gte('sends', 10)
    .order('last_updated_at', { ascending: false })
    .limit(100);

  if (data && data.length > 0) {
    const avgOpenRate =
      data.reduce((sum, row) => sum + row.open_rate, 0) / data.length;
    const avgReplyRate =
      data.reduce((sum, row) => sum + row.reply_rate, 0) / data.length;

    // If engagement is high, can send more
    const engagementMultiplier = Math.min(
      1.5,
      0.8 + (avgOpenRate * 0.3 + avgReplyRate * 0.7) * 2
    );

    return Math.round(baseRate * engagementMultiplier);
  }

  return baseRate;
}



























