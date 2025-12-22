/**
 * Send Wave Generator
 * Creates smart batches of emails to protect deliverability and maximize engagement
 */

import { createClient } from '@supabase/supabase-js';
import { selectOptimalSendTime, getBestSendTimes } from './algorithm';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface WaveConfig {
  scheduleId: string;
  campaignId: string;
  workspaceId: string;
  recipients: Array<{
    leadId: string;
    email: string;
    zipcode?: string;
  }>;
  waveSize?: number;
  waveIntervalMinutes?: number;
  startDate?: Date;
}

export interface GeneratedWave {
  waveNumber: number;
  sendAt: Date;
  recipients: Array<{
    leadId: string;
    email: string;
    zipcode?: string;
  }>;
  selectedHour: number;
  selectedDayOfWeek: number;
  zipcodeDistribution: Record<string, number>;
}

/**
 * Generate send waves for a campaign
 */
export async function generateSendWaves(
  config: WaveConfig
): Promise<GeneratedWave[]> {
  const {
    scheduleId,
    campaignId,
    workspaceId,
    recipients,
    waveSize = 50,
    waveIntervalMinutes = 30,
    startDate = new Date(),
  } = config;

  // Get schedule configuration
  const { data: schedule } = await supabase
    .from('campaign_schedules')
    .select('*')
    .eq('id', scheduleId)
    .single();

  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const waves: GeneratedWave[] = [];
  let currentDate = new Date(startDate);
  let remainingRecipients = [...recipients];
  let waveNumber = 1;

  // Group recipients by ZIP code for smart distribution
  const zipcodeGroups = groupByZipcode(remainingRecipients);

  while (remainingRecipients.length > 0) {
    // Select recipients for this wave
    const waveRecipients = remainingRecipients.splice(0, waveSize);

    // Determine optimal send time for this wave
    const zipcodes = waveRecipients
      .map((r) => r.zipcode)
      .filter((z): z is string => !!z);

    // Get most common ZIP code in this wave
    const mostCommonZip = getMostCommonZipcode(zipcodes);

    // Select optimal time
    const optimalTime = mostCommonZip
      ? await selectOptimalSendTime(workspaceId, mostCommonZip, {
          minHour: schedule.smart_send_min_hour || 9,
          maxHour: schedule.smart_send_max_hour || 17,
          daysOfWeek: schedule.smart_send_days_of_week || [1, 2, 3, 4, 5],
        })
      : null;

    // Calculate send time
    let sendAt: Date;
    if (optimalTime) {
      sendAt = calculateNextSendTime(
        currentDate,
        optimalTime.dayOfWeek,
        optimalTime.hour,
        schedule.smart_send_days_of_week || [1, 2, 3, 4, 5]
      );
    } else {
      // Default: next business day at 10 AM
      sendAt = getNextBusinessDay(currentDate, 10);
    }

    // Calculate ZIP code distribution
    const zipcodeDistribution = calculateZipcodeDistribution(waveRecipients);

    waves.push({
      waveNumber,
      sendAt,
      recipients: waveRecipients,
      selectedHour: optimalTime?.hour || 10,
      selectedDayOfWeek: optimalTime?.dayOfWeek || 1,
      zipcodeDistribution,
    });

    // Move to next wave time
    currentDate = new Date(sendAt);
    currentDate.setMinutes(currentDate.getMinutes() + waveIntervalMinutes);
    waveNumber++;
  }

  return waves;
}

/**
 * Create waves in database
 */
export async function createWavesInDatabase(
  waves: GeneratedWave[],
  config: WaveConfig
): Promise<string[]> {
  const { scheduleId, campaignId, workspaceId } = config;
  const waveIds: string[] = [];

  for (const wave of waves) {
    // Create wave record
    const { data: waveRecord, error: waveError } = await supabase
      .from('send_waves')
      .insert({
        schedule_id: scheduleId,
        campaign_id: campaignId,
        workspace_id: workspaceId,
        wave_number: wave.waveNumber,
        send_at: wave.sendAt.toISOString(),
        status: 'pending',
        total_recipients: wave.recipients.length,
        selected_hour: wave.selectedHour,
        selected_day_of_week: wave.selectedDayOfWeek,
        zipcode_distribution: wave.zipcodeDistribution,
      })
      .select('id')
      .single();

    if (waveError || !waveRecord) {
      console.error('Error creating wave:', waveError);
      continue;
    }

    // Create wave recipients
    const recipientsData = wave.recipients.map((r) => ({
      wave_id: waveRecord.id,
      campaign_id: campaignId,
      lead_id: r.leadId,
      recipient_email: r.email,
      zipcode: r.zipcode || null,
      status: 'queued',
      scheduled_send_at: wave.sendAt.toISOString(),
    }));

    const { error: recipientsError } = await supabase
      .from('wave_recipients')
      .insert(recipientsData);

    if (recipientsError) {
      console.error('Error creating wave recipients:', recipientsError);
    }

    waveIds.push(waveRecord.id);
  }

  return waveIds;
}

/**
 * Group recipients by ZIP code
 */
function groupByZipcode(
  recipients: Array<{ zipcode?: string }>
): Map<string, number> {
  const groups = new Map<string, number>();

  for (const recipient of recipients) {
    if (recipient.zipcode) {
      groups.set(
        recipient.zipcode,
        (groups.get(recipient.zipcode) || 0) + 1
      );
    }
  }

  return groups;
}

/**
 * Get most common ZIP code
 */
function getMostCommonZipcode(zipcodes: string[]): string | null {
  if (zipcodes.length === 0) return null;

  const counts = new Map<string, number>();
  for (const zip of zipcodes) {
    counts.set(zip, (counts.get(zip) || 0) + 1);
  }

  let maxCount = 0;
  let mostCommon = null;

  for (const [zip, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = zip;
    }
  }

  return mostCommon;
}

/**
 * Calculate ZIP code distribution for a wave
 */
function calculateZipcodeDistribution(
  recipients: Array<{ zipcode?: string }>
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const recipient of recipients) {
    const zip = recipient.zipcode || 'unknown';
    distribution[zip] = (distribution[zip] || 0) + 1;
  }

  return distribution;
}

/**
 * Calculate next send time based on optimal day/hour
 */
function calculateNextSendTime(
  fromDate: Date,
  targetDayOfWeek: number,
  targetHour: number,
  allowedDays: number[]
): Date {
  let current = new Date(fromDate);
  current.setHours(targetHour, 0, 0, 0);

  // If current day is not in allowed days, move to next allowed day
  while (!allowedDays.includes(current.getDay())) {
    current.setDate(current.getDate() + 1);
  }

  // If we've passed the target hour today, move to next occurrence
  if (current.getDay() === fromDate.getDay() && current <= fromDate) {
    // Move to next allowed day
    do {
      current.setDate(current.getDate() + 1);
    } while (!allowedDays.includes(current.getDay()));
  }

  // If target day is different, move to that day
  const daysUntilTarget = (targetDayOfWeek - current.getDay() + 7) % 7;
  if (daysUntilTarget > 0) {
    current.setDate(current.getDate() + daysUntilTarget);
  }

  return current;
}

/**
 * Get next business day at specified hour
 */
function getNextBusinessDay(fromDate: Date, hour: number): Date {
  const next = new Date(fromDate);
  next.setHours(hour, 0, 0, 0);

  // Skip weekends
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }

  // If we've passed the hour today, move to tomorrow
  if (next <= fromDate) {
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next;
}



























