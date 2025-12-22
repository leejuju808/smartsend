// Block 22465 — SmartSend Roofing Supplier Reliability Scoring v1
// Edge Function — Compute Supplier Reliability Scores
// 
// Purpose: Calculate reliability scores for suppliers based on their delivery history
// Can be triggered:
// - Nightly (cron) for all workspaces
// - On-demand when a material order is delivered/delayed/cancelled
// - For a specific workspace_id
//
// Input: { workspace_id?: string } (optional - if not provided, processes all)
// Output: { ok: true, processed: number }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey);

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { workspace_id } = body;

    // 1) Get aggregated stats from the view
    let query = supabase.from("supplier_delivery_stats").select("*");

    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data: stats, error } = await query;

    if (error) {
      console.error("Error fetching supplier stats:", error);
      throw error;
    }

    let processed = 0;

    for (const row of stats || []) {
      const {
        supplier_id,
        total_orders,
        delivered_orders,
        on_time_deliveries,
        delayed_orders,
        canceled_orders,
        avg_delay_days,
      } = row as any;

      if (!total_orders || total_orders === 0) {
        // No history yet → leave defaults, maybe low but not punishing
        await supabase
          .from("suppliers")
          .update({
            total_orders: 0,
            delivered_orders: 0,
            on_time_deliveries: 0,
            delayed_orders: 0,
            canceled_orders: 0,
            on_time_rate: 0,
            cancel_rate: 0,
            avg_delay_days: 0,
            reliability_score: 0,
            last_reliability_calculated_at: new Date().toISOString(),
          })
          .eq("id", supplier_id);
        processed++;
        continue;
      }

      const delivered = delivered_orders || 0;
      const onTime = on_time_deliveries || 0;
      const delayed = delayed_orders || 0;
      const canceled = canceled_orders || 0;
      const avgDelay = Number(avg_delay_days ?? 0);

      // Calculate rates
      const onTimeRate = delivered > 0 ? (onTime / delivered) * 100 : 0;
      const cancelRate = (canceled / total_orders) * 100;

      // Score formula (v1):
      // base = on_time_rate * 0.7
      // delivery_bonus = (delivered_orders / total_orders) * 100 * 0.2
      // cancel_penalty = cancel_rate * 0.3
      // delay_penalty = min(avg_delay_days * 5, 20)
      // score = base + delivery_bonus - cancel_penalty - delay_penalty
      // clamped_score = round(greatest(0, least(100, score)))

      const base = onTimeRate * 0.7;
      const deliveryBonus = (delivered / total_orders) * 100 * 0.2;
      const cancelPenalty = cancelRate * 0.3;
      const delayPenalty = Math.min(avgDelay * 5, 20);

      let score = base + deliveryBonus - cancelPenalty - delayPenalty;
      score = Math.max(0, Math.min(100, score));
      const roundedScore = Math.round(score);

      await supabase
        .from("suppliers")
        .update({
          total_orders,
          delivered_orders: delivered,
          on_time_deliveries: onTime,
          delayed_orders: delayed,
          canceled_orders: canceled,
          on_time_rate: onTimeRate,
          cancel_rate: cancelRate,
          avg_delay_days: avgDelay,
          reliability_score: roundedScore,
          last_reliability_calculated_at: new Date().toISOString(),
        })
        .eq("id", supplier_id);

      processed++;
    }

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error computing reliability scores:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});







































