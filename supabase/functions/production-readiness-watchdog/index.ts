// Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
// Edge Function: /production/readiness-watchdog
// 
// This function generates alerts when readiness changes:
// - Job goes from ready → not ready (critical)
// - Job goes from not ready → ready (info)
// - Supplier reliability < 70 & job starts tomorrow (warning)
// - Materials expected same day as start_date (warning)
// - Job scheduled with no materials (critical)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper function to compute readiness
function computeReadiness(
  orders: any[],
  startDate: Date,
  supplierMap: Map<string, any>
): { readiness: string; notes: string[] } {
  if (!orders.length) {
    return {
      readiness: "blocked_no_materials",
      notes: ["No materials ordered"],
    };
  }

  let anyDelayed = false;
  let latestETA: Date | null = null;
  let supplierRisk = false;

  for (const o of orders) {
    if (o.status === "delayed") {
      anyDelayed = true;
    }
    if (o.expected_delivery_date) {
      const eta = new Date(o.expected_delivery_date);
      if (!latestETA || eta > latestETA) {
        latestETA = eta;
      }
    }
    const supplier = o.supplier_id ? supplierMap.get(o.supplier_id) : null;
    if (supplier && supplier.reliability_score < 70) {
      supplierRisk = true;
    }
  }

  const notes: string[] = [];

  if (anyDelayed) {
    return {
      readiness: "material_delayed",
      notes: ["Material order delayed"],
    };
  }

  if (latestETA && latestETA > startDate) {
    return {
      readiness: "cutting_it_close",
      notes: [
        `Material ETA (${latestETA.toISOString().split("T")[0]}) is after start date`,
      ],
    };
  }

  if (supplierRisk) {
    notes.push("One or more suppliers have low reliability");
  }

  return {
    readiness: "ready",
    notes,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workspace_id, check_date } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Default to today + next 7 days if no date provided
    const checkDate = check_date || new Date().toISOString().split("T")[0];
    const tomorrow = new Date(checkDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // 1️⃣ Get production slots for today and tomorrow
    const { data: slots } = await supabase
      .from("job_production_slots")
      .select(
        `
        *,
        job:roofing_jobs(
          id,
          title,
          homeowner_name,
          address
        ),
        crew:crews(
          id,
          name
        )
      `
      )
      .eq("workspace_id", workspace_id)
      .in("start_date", [checkDate, tomorrowStr])
      .eq("status", "scheduled");

    if (!slots || slots.length === 0) {
      return new Response(
        JSON.stringify({ alerts_created: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2️⃣ Load material orders
    const jobIds = Array.from(
      new Set(slots.map((s: any) => s.job_id).filter(Boolean))
    );

    const { data: materials } = await supabase
      .from("material_orders")
      .select("id, job_id, expected_delivery_date, status, supplier_id")
      .in("job_id", jobIds.length ? jobIds : [null]);

    const materialsByJob = new Map<string, any[]>();
    for (const m of materials || []) {
      if (!materialsByJob.has(m.job_id)) {
        materialsByJob.set(m.job_id, []);
      }
      materialsByJob.get(m.job_id)!.push(m);
    }

    // 3️⃣ Get supplier reliability
    const supplierIds = Array.from(
      new Set(
        (materials || [])
          .map((m: any) => m.supplier_id)
          .filter(Boolean)
      )
    );

    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, reliability_score")
      .eq("workspace_id", workspace_id)
      .in("id", supplierIds.length ? supplierIds : [null]);

    const supplierMap = new Map(
      (suppliers || []).map((s: any) => [s.id, s])
    );

    // 4️⃣ Generate alerts
    const alertsToInsert: any[] = [];

    for (const slot of slots) {
      const job = slot.job;
      const crew = slot.crew;
      const orders = materialsByJob.get(slot.job_id) || [];
      const startDate = new Date(slot.start_date);
      const isTomorrow = slot.start_date === tomorrowStr;

      const { readiness, notes } = computeReadiness(
        orders,
        startDate,
        supplierMap
      );

      // Rule 1: Job scheduled with no materials (critical)
      if (readiness === "blocked_no_materials") {
        alertsToInsert.push({
          workspace_id: slot.workspace_id,
          job_id: slot.job_id,
          crew_id: slot.crew_id,
          type: "job_unready",
          severity: "critical",
          message: `Job "${job?.title || "Unnamed"}" scheduled for ${slot.start_date} has no materials ordered. Crew cannot start work.`,
        });
      }

      // Rule 2: Material delay (critical)
      if (readiness === "material_delayed") {
        alertsToInsert.push({
          workspace_id: slot.workspace_id,
          job_id: slot.job_id,
          crew_id: slot.crew_id,
          type: "material_delay",
          severity: "critical",
          message: `Material order delayed for "${job?.title || "Unnamed"}" scheduled ${slot.start_date}. Job may not start on time.`,
        });
      }

      // Rule 3: Materials cutting it close (warning)
      if (readiness === "cutting_it_close") {
        alertsToInsert.push({
          workspace_id: slot.workspace_id,
          job_id: slot.job_id,
          crew_id: slot.crew_id,
          type: "material_delay",
          severity: "warning",
          message: `Materials for "${job?.title || "Unnamed"}" arriving close to start date (${slot.start_date}). Monitor delivery.`,
        });
      }

      // Rule 4: Supplier reliability < 70 & job starts tomorrow (warning)
      if (isTomorrow) {
        let hasLowReliability = false;
        for (const o of orders) {
          const supplier = o.supplier_id
            ? supplierMap.get(o.supplier_id)
            : null;
          if (supplier && supplier.reliability_score < 70) {
            hasLowReliability = true;
            break;
          }
        }

        if (hasLowReliability) {
          alertsToInsert.push({
            workspace_id: slot.workspace_id,
            job_id: slot.job_id,
            crew_id: slot.crew_id,
            type: "readiness_change",
            severity: "warning",
            message: `Job "${job?.title || "Unnamed"}" starts tomorrow with supplier reliability < 70%. Monitor closely.`,
          });
        }
      }

      // Rule 5: Materials expected same day as start_date (warning)
      if (orders.length > 0) {
        for (const o of orders) {
          if (o.expected_delivery_date === slot.start_date) {
            alertsToInsert.push({
              workspace_id: slot.workspace_id,
              job_id: slot.job_id,
              crew_id: slot.crew_id,
              type: "material_delay",
              severity: "warning",
              message: `Materials for "${job?.title || "Unnamed"}" expected same day as start (${slot.start_date}). Cutting it close.`,
            });
            break;
          }
        }
      }
    }

    // 5️⃣ Insert alerts (dedupe by checking recent alerts)
    if (alertsToInsert.length > 0) {
      // Check for existing alerts in last 24 hours to avoid duplicates
      const recentAlertKeys = new Set<string>();
      const { data: recentAlerts } = await supabase
        .from("production_alerts")
        .select("job_id, type, created_at")
        .eq("workspace_id", workspace_id)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      for (const alert of recentAlerts || []) {
        recentAlertKeys.add(`${alert.job_id}-${alert.type}`);
      }

      const newAlerts = alertsToInsert.filter(
        (a) => !recentAlertKeys.has(`${a.job_id}-${a.type}`)
      );

      if (newAlerts.length > 0) {
        const { error: insertError } = await supabase
          .from("production_alerts")
          .insert(newAlerts);

        if (insertError) throw insertError;
      }

      return new Response(
        JSON.stringify({
          alerts_created: newAlerts.length,
          total_checked: alertsToInsert.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ alerts_created: 0 }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Readiness watchdog error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});







































