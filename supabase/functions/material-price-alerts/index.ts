// Block 22510 — SmartSend Roofing Material Cost History & Price Spike Alerts v1
// Edge Function: Detect material price spikes by comparing baseline vs recent prices

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey);

// Default: 15% spike threshold
const DEFAULT_THRESHOLD = 15;
const MIN_ABSOLUTE_CHANGE = 2; // Minimum $2 increase to trigger alert

serve(async (req) => {
  try {
    const { workspace_id, threshold_percent } = await req.json();
    const threshold = threshold_percent ?? DEFAULT_THRESHOLD;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1) Get distinct supplier + item combos for this workspace
    const { data: items, error: itemsError } = await supabase
      .from("material_order_items")
      .select("description, sku, category, material_order_id, workspace_id")
      .eq("workspace_id", workspace_id)
      .not("unit_price", "is", null)
      .gt("unit_price", 0);

    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "no items found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Map item material_order_ids to supplier_ids
    const orderIds = [...new Set(items.map((i) => i.material_order_id))];
    const { data: orders, error: ordersError } = await supabase
      .from("material_orders")
      .select("id, supplier_id")
      .in("id", orderIds);

    if (ordersError) throw ordersError;

    const supplierMap = new Map<string, string | null>();
    for (const o of orders || []) {
      supplierMap.set(o.id, o.supplier_id);
    }

    // Build a distinct set of (supplier_id, item_description, sku, category)
    const keySet = new Set<string>();
    const keys: {
      supplier_id: string | null;
      item_description: string;
      item_sku: string | null;
      category: string | null;
    }[] = [];

    for (const item of items) {
      const supplier_id = supplierMap.get(item.material_order_id) || null;
      const key = `${supplier_id}|${item.description}|${item.sku ?? ""}|${item.category ?? ""}`;
      if (!keySet.has(key)) {
        keySet.add(key);
        keys.push({
          supplier_id,
          item_description: item.description,
          item_sku: item.sku ?? null,
          category: item.category ?? null,
        });
      }
    }

    const now = new Date();
    const recentStart = new Date(now);
    recentStart.setDate(now.getDate() - 30);

    const baselineStart = new Date(now);
    baselineStart.setDate(now.getDate() - 120);

    let alertsCreated = 0;

    // 2) For each key, compute baseline vs recent
    for (const k of keys) {
      if (!k.supplier_id) continue;

      // Build query filters
      const query = supabase
        .from("material_order_items")
        .select("unit_price, created_at, material_order_id")
        .eq("workspace_id", workspace_id)
        .eq("description", k.item_description)
        .not("unit_price", "is", null)
        .gt("unit_price", 0);

      if (k.item_sku) {
        query.eq("sku", k.item_sku);
      } else {
        query.is("sku", null);
      }

      if (k.category) {
        query.eq("category", k.category);
      } else {
        query.is("category", null);
      }

      const { data: itemPrices, error: priceError } = await query;

      if (priceError) throw priceError;
      if (!itemPrices || itemPrices.length < 4) continue; // need some history

      let baselineSum = 0;
      let baselineCount = 0;
      let recentSum = 0;
      let recentCount = 0;

      for (const row of itemPrices) {
        const created = new Date(row.created_at);
        const price = Number(row.unit_price);

        if (created >= recentStart) {
          recentSum += price;
          recentCount++;
        } else if (created >= baselineStart && created < recentStart) {
          baselineSum += price;
          baselineCount++;
        }
      }

      if (recentCount === 0 || baselineCount === 0) continue;

      const baselineAvg = baselineSum / baselineCount;
      const recentAvg = recentSum / recentCount;

      if (baselineAvg <= 0) continue;

      const change = ((recentAvg - baselineAvg) / baselineAvg) * 100;
      const absoluteChange = recentAvg - baselineAvg;

      if (change >= threshold && absoluteChange >= MIN_ABSOLUTE_CHANGE) {
        // Check if there's already an open alert for this item + supplier
        const { data: existingAlert } = await supabase
          .from("material_price_alerts")
          .select("id")
          .eq("workspace_id", workspace_id)
          .eq("supplier_id", k.supplier_id)
          .eq("item_name", k.item_description)
          .eq("status", "open")
          .limit(1)
          .single();

        // Only create if no open alert exists (idempotent)
        if (!existingAlert) {
          const { error: insertError } = await supabase
            .from("material_price_alerts")
            .insert({
              workspace_id,
              supplier_id: k.supplier_id,
              item_name: k.item_description,
              item_sku: k.item_sku,
              category: k.category,
              previous_avg_unit_price: Math.round(baselineAvg * 100) / 100,
              recent_avg_unit_price: Math.round(recentAvg * 100) / 100,
              percent_change: Math.round(change * 100) / 100,
              threshold_percent: threshold,
              status: "open",
            });

          if (insertError) {
            console.error(`Failed to insert alert for ${k.item_description}:`, insertError);
          } else {
            alertsCreated++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        alerts_created: alertsCreated,
        items_checked: keys.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Price alert detection error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});







































