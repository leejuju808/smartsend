import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ThrottleCheck {
  ok: boolean;
  reason?: string;
  cap: number;
  used: number;
  warmup_level: number;
  daily_cap: number;
  allowed: number;
}

export async function canSendToday(userId: string): Promise<ThrottleCheck> {
  try {
    // Use the database function to check if user can send today
    const { data, error } = await supabase.rpc('can_send_today', {
      p_user_id: userId
    });

    if (error) {
      console.error('Error checking send limits:', error);
      return {
        ok: false,
        reason: "Error checking send limits",
        cap: 0,
        used: 0,
        warmup_level: 1,
        daily_cap: 200,
        allowed: 50
      };
    }

    if (!data || data.length === 0) {
      return {
        ok: false,
        reason: "Profile not found",
        cap: 0,
        used: 0,
        warmup_level: 1,
        daily_cap: 200,
        allowed: 50
      };
    }

    const result = data[0];
    
    return {
      ok: result.can_send,
      reason: result.can_send ? undefined : "Daily cap reached",
      cap: result.daily_cap,
      used: result.used_today,
      warmup_level: result.warmup_level,
      daily_cap: result.daily_cap,
      allowed: result.allowed
    };
  } catch (error) {
    console.error('Exception in canSendToday:', error);
    return {
      ok: false,
      reason: "Exception checking send limits",
      cap: 0,
      used: 0,
      warmup_level: 1,
      daily_cap: 200,
      allowed: 50
    };
  }
}

export async function getDailySendCount(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_daily_send_count', {
      p_user_id: userId
    });

    if (error) {
      console.error('Error getting daily send count:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Exception getting daily send count:', error);
    return 0;
  }
}

export async function incrementWarmupLevel(): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_warmup');
    if (error) {
      console.error('Error incrementing warmup level:', error);
    }
  } catch (error) {
    console.error('Exception incrementing warmup level:', error);
  }
}

export async function updateProfileWarmup(userId: string, warmupLevel: number, dailyCap: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        warmup_level: warmupLevel,
        daily_send_cap: dailyCap
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating profile warmup:', error);
    }
  } catch (error) {
    console.error('Exception updating profile warmup:', error);
  }
} 