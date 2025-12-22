// Block 22560 — SmartSend Roofing Job Profit Snapshot v1
// Edge Function — Get Profit Snapshot for a Job
// Returns revenue, costs, profit, margin, and warnings

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { job_id, workspace_id } = await req.json();

    if (!job_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "job_id and workspace_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 1) Get main job info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, job_value, supplement_amount")
      .eq("id", job_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found." }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const contract = Number(job.job_value ?? 0);
    const supplement = Number(job.supplement_amount ?? 0);

    // 2) Get approved change orders
    const { data: changeOrders, error: coError } = await supabase
      .from("job_change_orders")
      .select("amount")
      .eq("job_id", job_id)
      .eq("status", "approved");

    if (coError) {
      console.error("Error fetching change orders:", coError);
    }

    const changeOrderTotal = (changeOrders || []).reduce(
      (sum, co) => sum + Number(co.amount),
      0
    );

    // 3) Get pending change orders (for warnings)
    const { data: pendingChangeOrders, error: pendingCoError } = await supabase
      .from("job_change_orders")
      .select("amount")
      .eq("job_id", job_id)
      .eq("status", "pending");

    if (pendingCoError) {
      console.error("Error fetching pending change orders:", pendingCoError);
    }

    const pendingChangeOrderTotal = (pendingChangeOrders || []).reduce(
      (sum, co) => sum + Number(co.amount),
      0
    );

    // 4) Get material total from order items
    // Join through material_orders to get items for this job
    const { data: orders, error: ordersError } = await supabase
      .from("material_orders")
      .select("id")
      .eq("job_id", job_id)
      .eq("workspace_id", workspace_id);

    if (ordersError) {
      console.error("Error fetching material orders:", ordersError);
    }

    let materialCost = 0;
    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: items, error: itemsError } = await supabase
        .from("material_order_items")
        .select("total_price")
        .in("material_order_id", orderIds);

      if (itemsError) {
        console.error("Error fetching material order items:", itemsError);
      } else {
        materialCost = (items || []).reduce(
          (sum, i) => sum + Number(i.total_price || 0),
          0
        );
      }
    }

    // 5) Get labor total
    const { data: laborRows, error: laborError } = await supabase
      .from("job_labor_costs")
      .select("total_cost")
      .eq("job_id", job_id);

    if (laborError) {
      console.error("Error fetching labor costs:", laborError);
    }

    const laborCost = (laborRows || []).reduce(
      (sum, l) => sum + Number(l.total_cost || 0),
      0
    );

    // Calculate totals
    const totalRevenue = contract + supplement + changeOrderTotal;
    const totalCost = materialCost + laborCost;
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // Generate warnings
    const warnings: string[] = [];
    
    if (margin < 30) {
      warnings.push("Low margin — check labor & material overruns.");
    }
    
    if (totalRevenue > 0 && materialCost > totalRevenue * 0.5) {
      warnings.push("Material cost exceeds 50% of revenue.");
    }
    
    if (totalRevenue > 0 && laborCost > totalRevenue * 0.35) {
      warnings.push("Labor cost high relative to job size.");
    }
    
    if (pendingChangeOrderTotal > 500) {
      warnings.push(`${pendingChangeOrders?.length || 0} change order(s) pending approval ($${pendingChangeOrderTotal.toFixed(2)}).`);
    }

    return new Response(
      JSON.stringify({
        job_id,
        revenue: totalRevenue,
        costs: {
          material: materialCost,
          labor: laborCost,
        },
        profit,
        margin,
        warnings,
        breakdown: {
          contract: contract,
          supplement: supplement,
          change_orders: changeOrderTotal,
          pending_change_orders: pendingChangeOrderTotal,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    console.error("Error in profit snapshot:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});







































