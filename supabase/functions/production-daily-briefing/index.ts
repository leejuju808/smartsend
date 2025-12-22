// Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
// Edge Function: /production/daily-briefing
// 
// This function:
// - Takes a workspace_id + date
// - Returns briefing cards grouped by crew
// - Shows job readiness, material status, delivery ETAs, risk flags

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { workspace_id, date } = await req.json();

    if (!workspace_id || !date) {
      return new Response(
        JSON.stringify({ error: "workspace_id and date required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1️⃣ Get production slots for the day
    const { data: slots, error: slotsError } = await supabase
      .from("job_production_slots")
      .select(
        `
        *,
        job:roofing_jobs(
          id,
          title,
          homeowner_name,
          address,
          job_value
        ),
        crew:crews(
          id,
          name,
          foreman_name,
          foreman_phone
        )
      `
      )
      .eq("workspace_id", workspace_id)
      .eq("start_date", date)
      .eq("status", "scheduled");

    if (slotsError) throw slotsError;

    if (!slots || slots.length === 0) {
      return new Response(
        JSON.stringify({ briefing: {} }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2️⃣ Load material readiness for each job
    const jobIds = Array.from(
      new Set(slots.map((s: any) => s.job_id).filter(Boolean))
    );

    const { data: materials } = await supabase
      .from("material_orders")
      .select("id, job_id, expected_delivery_date, status, supplier_id, notes")
      .in("job_id", jobIds.length ? jobIds : [null]);

    const materialsByJob = new Map<string, any[]>();
    for (const m of materials || []) {
      if (!materialsByJob.has(m.job_id)) {
        materialsByJob.set(m.job_id, []);
      }
      materialsByJob.get(m.job_id)!.push(m);
    }

    // 3️⃣ Get supplier reliability scores
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

    // 4️⃣ Compute readiness per job and group by crew
    const briefingByCrew: Record<string, any[]> = {};

    for (const slot of slots) {
      const crewId = slot.crew_id || "unassigned";
      if (!briefingByCrew[crewId]) {
        briefingByCrew[crewId] = [];
      }

      const job = slot.job;
      const crew = slot.crew;
      const orders = materialsByJob.get(slot.job_id) || [];

      let readiness = "ready";
      let notes: string[] = [];

      if (!orders.length) {
        readiness = "blocked_no_materials";
        notes.push("⚠️ No materials ordered.");
      } else {
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
          const supplier = o.supplier_id
            ? supplierMap.get(o.supplier_id)
            : null;
          if (supplier && supplier.reliability_score < 70) {
            supplierRisk = true;
          }
        }

        const startDate = new Date(slot.start_date);

        if (anyDelayed) {
          readiness = "material_delayed";
          notes.push("⚠️ Delayed materials.");
        } else if (latestETA && latestETA > startDate) {
          readiness = "cutting_it_close";
          notes.push(
            `⚠️ Latest ETA (${latestETA.toISOString().split("T")[0]}) is after start date.`
          );
        }

        if (supplierRisk) {
          notes.push("⚠️ One or more suppliers have low reliability.");
        }
      }

      briefingByCrew[crewId].push({
        slot_id: slot.id,
        job_id: slot.job_id,
        job_name: job?.title || "Unnamed Job",
        job_address: job?.address || "",
        homeowner_name: job?.homeowner_name || "",
        job_value: job?.job_value || 0,
        readiness,
        job_notes: notes,
        start_date: slot.start_date,
        end_date: slot.end_date,
        crew_name: crew?.name || "Unassigned",
        foreman_name: crew?.foreman_name || null,
        foreman_phone: crew?.foreman_phone || null,
      });
    }

    return new Response(
      JSON.stringify({ briefing: briefingByCrew }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Daily briefing error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});







































