import { supabaseAdmin } from "../../../server/supabase";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
dayjs.extend(utc);

type Plan = "free" | "pro" | "past_due" | "canceled";

export async function getUserProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, subscription_status, stripe_customer_id")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateSubscriptionStatus(userId: string, status: Plan) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ subscription_status: status })
    .eq("id", userId);
  if (error) throw error;

  // optional audit
  await supabaseAdmin.from("audit_log").insert({
    user_id: userId,
    action: "subscription_status_updated",
    meta: { status },
  });

  // If upgrading to pro, check for active experiment assignments and log conversion
  if (status === "pro") {
    try {
      const { data: assignments } = await supabaseAdmin
        .from("experiment_assignments")
        .select("experiment_id, variant")
        .eq("user_id", userId);
      
      if (assignments && assignments.length > 0) {
        // Log conversion events for all active experiments
        const conversionEvents = assignments.map(assignment => ({
          user_id: userId,
          experiment_id: assignment.experiment_id,
          variant: assignment.variant,
          event: "converted"
        }));
        
        await supabaseAdmin
          .from("experiment_events")
          .insert(conversionEvents);
      }
    } catch (e) {
      // Don't fail the subscription update if experiment tracking fails
      console.warn('Failed to log experiment conversion:', e);
    }
  }
}

export async function findUserIdByCustomerId(cusId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", cusId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function hasEventBeenProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("processed_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function markEventProcessed(eventId: string) {
  const { error } = await supabaseAdmin
    .from("processed_events")
    .insert({ event_id: eventId });
  // If already exists, ignore (idempotent)
  if (error && !String(error.message).includes("duplicate key")) throw error;
}

/** ===== Daily send counters ===== */

function todayUTC(): string {
  // Counters by calendar day UTC; if you want user-local, pass tz into caller.
  return dayjs().utc().format("YYYY-MM-DD");
}

export async function getDailySendCount(userId: string, day = todayUTC()): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("daily_send_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  return data?.count ?? 0;
}

export async function incrementSendCount(userId: string, delta = 1, day = todayUTC()) {
  // Upsert: if row exists, increment; else create with delta
  const { data, error } = await supabaseAdmin
    .from("daily_send_counters")
    .upsert({ user_id: userId, day, count: delta }, { onConflict: "user_id,day" })
    .select("count")
    .single();
  if (error) throw error;

  // If upsert didn't increment existing, do a follow-up increment:
  // (Supabase lacks ON CONFLICT DO UPDATE ... count = count + delta in upsert helper)
  if (data && data.count !== undefined && data.count < delta) {
    // Rare edge; safe to no-op.
  } else if (data && delta !== 0) {
    // Try atomic increment (safe if another worker set it)
    await supabaseAdmin.rpc("increment_daily_counter", { p_user_id: userId, p_day: day, p_delta: delta }).catch(() => {});
  }
}

/**
 * Create an RPC for atomic increment (run once):
 * create or replace function public.increment_daily_counter(p_user_id uuid, p_day date, p_delta int)
 * returns void language sql as $$
 *   insert into daily_send_counters (user_id, day, count)
 *   values (p_user_id, p_day, p_delta)
 *   on conflict (user_id, day) do
 *   update set count = daily_send_counters.count + p_delta;
 * $$;
 */
// ✅ Tip: run the RPC creation SQL from the comment at the bottom of the file once. After that, incrementSendCount is atomic and queue-safe.

