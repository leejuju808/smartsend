/**
 * Block 19750 — Inbox Onboarding Helpers
 * Utility functions for onboarding beta testers
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface OnboardingStatus {
  enrolled: boolean;
  onboardingCompleted: boolean;
  firstInboxOpen: boolean;
  firstReplyCaptured: boolean;
  phase: string | null;
  enrolledAt: string | null;
  onboardingCompletedAt: string | null;
  firstInboxOpenAt: string | null;
  firstReplyCapturedAt: string | null;
}

/**
 * Get onboarding status for a user
 */
export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from('inbox_rollout_tracking')
      .select('*')
      .eq('user_id', userId)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      console.error('Error fetching onboarding status:', error);
    }

    if (!data) {
      return {
        enrolled: false,
        onboardingCompleted: false,
        firstInboxOpen: false,
        firstReplyCaptured: false,
        phase: null,
        enrolledAt: null,
        onboardingCompletedAt: null,
        firstInboxOpenAt: null,
        firstReplyCapturedAt: null,
      };
    }

    return {
      enrolled: true,
      onboardingCompleted: !!data.onboarding_completed_at,
      firstInboxOpen: !!data.first_inbox_open_at,
      firstReplyCaptured: !!data.first_reply_captured_at,
      phase: data.phase,
      enrolledAt: data.enrolled_at,
      onboardingCompletedAt: data.onboarding_completed_at,
      firstInboxOpenAt: data.first_inbox_open_at,
      firstReplyCapturedAt: data.first_reply_captured_at,
    };
  } catch (error) {
    console.error('Error getting onboarding status:', error);
    return {
      enrolled: false,
      onboardingCompleted: false,
      firstInboxOpen: false,
      firstReplyCaptured: false,
      phase: null,
      enrolledAt: null,
      onboardingCompletedAt: null,
      firstInboxOpenAt: null,
      firstReplyCapturedAt: null,
    };
  }
}

/**
 * Mark onboarding as completed
 */
export async function markOnboardingCompleted(userId: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabase
      .from('inbox_rollout_tracking')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('onboarding_completed_at', null); // Only update if not already set

    if (error) {
      console.error('Error marking onboarding completed:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error marking onboarding completed:', error);
    return false;
  }
}

/**
 * Record first inbox open
 */
export async function recordFirstInboxOpen(userId: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabase
      .from('inbox_rollout_tracking')
      .update({ first_inbox_open_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('first_inbox_open_at', null); // Only update if not already set

    if (error) {
      console.error('Error recording first inbox open:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error recording first inbox open:', error);
    return false;
  }
}

/**
 * Record first reply captured
 */
export async function recordFirstReplyCaptured(userId: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { error } = await supabase
      .from('inbox_rollout_tracking')
      .update({ first_reply_captured_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('first_reply_captured_at', null); // Only update if not already set

    if (error) {
      console.error('Error recording first reply captured:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error recording first reply captured:', error);
    return false;
  }
}



















































