/**
 * Block 24140 — Advanced Scheduler v2
 * Component 1: Wave-Based Sending System (Drip System)
 * 
 * Instead of sending 500 emails instantly:
 * - SmartSend sends in waves: 30-50 emails → small pause → 30-50 emails → repeat
 * - The pauses adjust dynamically based on deliverability and engagement
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const supabase = supabaseAdmin;

export interface WaveConfig {
  batchSize: number; // 30-50 emails per wave
  pauseDurationSeconds: number; // Dynamic pause between waves
  maxWavesPerDay?: number;
}

const DEFAULT_WAVE_CONFIG: WaveConfig = {
  batchSize: 50,
  pauseDurationSeconds: 300, // 5 minutes default
  maxWavesPerDay: 20, // Max 20 waves per day = ~1000 emails/day max
};

/**
 * Create a new sending wave for a workspace
 */
export async function createWave(
  workspaceId: string,
  waveNumber: number,
  config: Partial<WaveConfig> = {}
): Promise<string | null> {
  const finalConfig = { ...DEFAULT_WAVE_CONFIG, ...config };
  
  const { data: wave, error } = await supabase
    .from("send_waves")
    .insert({
      workspace_id: workspaceId,
      wave_number: waveNumber,
      batch_size: finalConfig.batchSize,
      pause_duration_seconds: finalConfig.pauseDurationSeconds,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating wave:", error);
    return null;
  }

  return wave.id;
}

/**
 * Get pending emails for a wave (respecting batch size and priority)
 */
export async function getWaveEmails(
  workspaceId: string,
  waveId: string,
  batchSize: number
): Promise<any[]> {
  // Get pending emails, prioritizing by campaign priority and scheduled_at
  const { data: emails, error } = await supabase
    .from("send_queue")
    .select(`
      *,
      campaigns!inner(workspace_id, campaign_type, campaign_priority, status)
    `)
    .eq("status", "pending")
    .eq("campaigns.workspace_id", workspaceId)
    .eq("campaigns.status", "active")
    .lte("scheduled_at", new Date().toISOString())
    .is("wave_id", null) // Not already assigned to a wave
    .order("priority", { ascending: false }) // Higher priority first
    .order("scheduled_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("Error fetching wave emails:", error);
    return [];
  }

  return emails || [];
}

/**
 * Assign emails to a wave
 */
export async function assignEmailsToWave(
  waveId: string,
  emailIds: string[]
): Promise<void> {
  if (emailIds.length === 0) return;

  // Update emails with wave_id and wave_position
  const updates = emailIds.map((id, index) => ({
    id,
    wave_id: waveId,
    wave_position: index + 1,
  }));

  for (const update of updates) {
    await supabase
      .from("send_queue")
      .update({
        wave_id: update.wave_id,
        wave_position: update.wave_position,
      })
      .eq("id", update.id);
  }
}

/**
 * Complete a wave (mark as done)
 */
export async function completeWave(waveId: string, emailsSent: number): Promise<void> {
  await supabase
    .from("send_waves")
    .update({
      completed_at: new Date().toISOString(),
      emails_sent: emailsSent,
    })
    .eq("id", waveId);
}

/**
 * Get next wave number for a workspace
 */
export async function getNextWaveNumber(workspaceId: string): Promise<number> {
  const { data: lastWave } = await supabase
    .from("send_waves")
    .select("wave_number")
    .eq("workspace_id", workspaceId)
    .order("wave_number", { ascending: false })
    .limit(1)
    .single();

  return (lastWave?.wave_number || 0) + 1;
}

/**
 * Calculate dynamic pause duration based on:
 * - Current deliverability health
 * - Recent engagement rates
 * - Time of day
 * - Number of waves sent today
 */
export async function calculateDynamicPause(
  workspaceId: string
): Promise<number> {
  // Base pause: 5 minutes (300 seconds)
  let pauseSeconds = 300;

  // Check deliverability health
  const { data: health } = await supabase
    .from("deliverability_health")
    .select("health_score, reputation_status")
    .eq("workspace_id", workspaceId)
    .order("last_checked_at", { ascending: false })
    .limit(1)
    .single();

  if (health) {
    // If health is poor, increase pause
    if (health.reputation_status === "poor") {
      pauseSeconds = 600; // 10 minutes
    } else if (health.reputation_status === "critical") {
      pauseSeconds = 1800; // 30 minutes
    } else if (health.health_score < 70) {
      pauseSeconds = 450; // 7.5 minutes
    }
  }

  // Check waves sent today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: wavesToday } = await supabase
    .from("send_waves")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("started_at", todayStart.toISOString());

  // If many waves sent today, increase pause
  if ((wavesToday || 0) > 15) {
    pauseSeconds = Math.max(pauseSeconds, 600); // At least 10 minutes
  }

  // Check time of day - longer pauses during off-hours
  const now = new Date();
  const hour = now.getHours();
  if (hour < 7 || hour > 20) {
    pauseSeconds = Math.max(pauseSeconds, 900); // At least 15 minutes during off-hours
  }

  return pauseSeconds;
}

/**
 * Check if a workspace can send another wave right now
 */
export async function canSendWave(workspaceId: string): Promise<boolean> {
  // Check throttle status
  const { data: quality } = await supabase
    .from("list_quality_metrics")
    .select("throttle_level")
    .eq("workspace_id", workspaceId)
    .order("metric_date", { ascending: false })
    .limit(1)
    .single();

  if (quality?.throttle_level === "paused") {
    return false;
  }

  // Check if there's an active wave that hasn't completed
  const { data: activeWave } = await supabase
    .from("send_waves")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("completed_at", null)
    .limit(1)
    .single();

  if (activeWave) {
    // Check if enough time has passed since wave started
    const { data: wave } = await supabase
      .from("send_waves")
      .select("started_at, pause_duration_seconds")
      .eq("id", activeWave.id)
      .single();

    if (wave?.started_at) {
      const waveStart = new Date(wave.started_at);
      const pauseDuration = wave.pause_duration_seconds || 300;
      const nextWaveTime = new Date(waveStart.getTime() + pauseDuration * 1000);

      if (new Date() < nextWaveTime) {
        return false; // Still in pause period
      }
    }
  }

  return true;
}

/**
 * Process a wave: assign emails, mark for sending
 */
export async function processWave(workspaceId: string): Promise<{
  waveId: string | null;
  emailsAssigned: number;
}> {
  // Check if we can send a wave
  if (!(await canSendWave(workspaceId))) {
    return { waveId: null, emailsAssigned: 0 };
  }

  // Get next wave number
  const waveNumber = await getNextWaveNumber(workspaceId);

  // Calculate dynamic pause
  const pauseDuration = await calculateDynamicPause(workspaceId);

  // Create wave
  const waveId = await createWave(workspaceId, waveNumber, {
    pauseDurationSeconds: pauseDuration,
  });

  if (!waveId) {
    return { waveId: null, emailsAssigned: 0 };
  }

  // Get emails for this wave
  const emails = await getWaveEmails(workspaceId, waveId, DEFAULT_WAVE_CONFIG.batchSize);

  if (emails.length === 0) {
    // No emails to send, mark wave as complete
    await completeWave(waveId, 0);
    return { waveId, emailsAssigned: 0 };
  }

  // Assign emails to wave
  const emailIds = emails.map((e) => e.id);
  await assignEmailsToWave(waveId, emailIds);

  return {
    waveId,
    emailsAssigned: emails.length,
  };
}






































