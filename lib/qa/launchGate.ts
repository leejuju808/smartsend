import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Check if account can launch (all critical QA checks passed)
 * This is the gate that prevents onboarding if checks fail
 */
export async function canAccountLaunch(accountId: string): Promise<{
  canLaunch: boolean;
  reason?: string;
  latestRun?: any;
}> {
  const supabase = await createClient();

  try {
    // Check using database function
    const { data, error } = await supabase.rpc('can_account_launch', {
      p_account_id: accountId,
    });

    if (error) {
      console.error('Error checking launch status:', error);
      // If function doesn't exist or fails, default to blocking launch
      return {
        canLaunch: false,
        reason: 'Unable to verify QA status',
      };
    }

    // Get latest run for details
    const { data: latestRun } = await supabase
      .from('qa_check_runs')
      .select('*')
      .eq('account_id', accountId)
      .eq('run_type', 'full')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestRun) {
      return {
        canLaunch: false,
        reason: 'No QA check run found. Please run QA checks before launching.',
      };
    }

    if (latestRun.critical_failures > 0) {
      return {
        canLaunch: false,
        reason: `${latestRun.critical_failures} critical check${latestRun.critical_failures !== 1 ? 's' : ''} failed. Fix these issues before launching.`,
        latestRun,
      };
    }

    return {
      canLaunch: data === true,
      latestRun,
    };
  } catch (error: any) {
    console.error('Error in canAccountLaunch:', error);
    return {
      canLaunch: false,
      reason: `Error checking launch status: ${error.message}`,
    };
  }
}

/**
 * Middleware helper to block requests if account cannot launch
 * Use this in API routes that should be blocked before launch
 */
export async function requireLaunchReady(
  accountId: string
): Promise<NextResponse | null> {
  const { canLaunch, reason } = await canAccountLaunch(accountId);

  if (!canLaunch) {
    return NextResponse.json(
      {
        error: 'LAUNCH_NOT_READY',
        message: reason || 'QA checks must pass before using this feature',
        blocked: true,
      },
      { status: 403 }
    );
  }

  return null; // Allowed to proceed
}

/**
 * Component helper to check launch status client-side
 */
export async function getLaunchStatus(accountId: string) {
  try {
    const response = await fetch(`/api/qa/can-launch?account_id=${accountId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error checking launch status:', error);
    return { canLaunch: false, error: 'Failed to check launch status' };
  }
}
























































