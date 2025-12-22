// Block 22670 — SmartSend Roofing Production Calendar v1
// Edge Function: Returns production slots + readiness for a given date range
//
// This function:
// - Fetches all production slots in a date range
// - Enriches with job info, crew info, material orders
// - Computes readiness status based on material orders and supplier reliability

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client
    const authToken = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, authToken);

    // Verify user
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { workspace_id, start_date, end_date } = await req.json();

    if (!workspace_id || !start_date || !end_date) {
      return new Response(
        JSON.stringify({
          error: "workspace_id, start_date, end_date required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "Forbidden: No access to workspace" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1️⃣ Get all production slots in range
    const { data: slots, error: slotsError } = await supabase
      .from("job_production_slots")
      .select("id, job_id, crew_id, start_date, end_date, status")
      .eq("workspace_id", workspace_id)
      .gte("start_date", start_date)
      .lte("start_date", end_date);

    if (slotsError) throw slotsError;

    // 2️⃣ Load job info
    const jobIds = Array.from(new Set((slots || []).map((s) => s.job_id)));
    const crewIds = Array.from(
      new Set((slots || []).map((s) => s.crew_id).filter(Boolean))
    );

    const [{ data: jobs }, { data: crews }] = await Promise.all([
      supabase
        .from("roofing_jobs")
        .select("id, homeowner_name, address, projected_job_value")
        .in("id", jobIds.length ? jobIds : [null]),
      supabase
        .from("crews")
        .select("id, name, foreman_name")
        .in("id", crewIds.length ? crewIds : [null]),
    ]);

    const jobMap = new Map(jobs?.map((j) => [j.id, j]) || []);
    const crewMap = new Map(crews?.map((c) => [c.id, c]) || []);

    // 3️⃣ Material orders for jobs
    const { data: materialOrders } = await supabase
      .from("material_orders")
      .select("id, job_id, supplier_id, expected_delivery_date, status")
      .in("job_id", jobIds.length ? jobIds : [null]);

    const ordersByJob = new Map<string, any[]>();
    for (const mo of materialOrders || []) {
      if (!ordersByJob.has(mo.job_id)) {
        ordersByJob.set(mo.job_id, []);
      }
      ordersByJob.get(mo.job_id)!.push(mo);
    }

    // 4️⃣ Supplier reliability
    const supplierIds = Array.from(
      new Set(
        (materialOrders || [])
          .map((mo) => mo.supplier_id)
          .filter(Boolean)
      )
    );

    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, reliability_score")
      .eq("workspace_id", workspace_id)
      .in("id", supplierIds.length ? supplierIds : [null]);

    const supplierMap = new Map(suppliers?.map((s) => [s.id, s]) || []);

    // 5️⃣ Compute readiness per slot
    const enrichedSlots = (slots || []).map((slot) => {
      const job = jobMap.get(slot.job_id);
      const crew = slot.crew_id ? crewMap.get(slot.crew_id) : null;

      const orders = ordersByJob.get(slot.job_id) || [];

      let readiness = "ready";
      let flags: string[] = [];

      if (!orders.length) {
        readiness = "blocked_no_materials";
        flags.push("No materials ordered yet.");
      } else {
        let earliestEta: Date | null = null;
        let anyDelayed = false;
        let supplierRisk = false;

        for (const o of orders) {
          if (o.expected_delivery_date) {
            const eta = new Date(o.expected_delivery_date);
            if (!earliestEta || eta < earliestEta) {
              earliestEta = eta;
            }
          }
          if (o.status === "delayed") {
            anyDelayed = true;
          }
          const supplier = o.supplier_id ? supplierMap.get(o.supplier_id) : null;
          if (supplier && supplier.reliability_score < 70) {
            supplierRisk = true;
          }
        }

        const start = new Date(slot.start_date);

        if (anyDelayed) {
          readiness = "material_delayed";
          flags.push("Material order delayed.");
        } else if (earliestEta && earliestEta > start) {
          readiness = "cutting_it_close";
          flags.push("Material ETA after start date.");
        }

        if (supplierRisk) {
          flags.push("One or more suppliers are low reliability.");
        }
      }

      return {
        slot,
        job: job
          ? {
              id: job.id,
              name: job.homeowner_name || "Unnamed Job",
              address: job.address,
              projected_value: job.projected_job_value,
            }
          : null,
        crew: crew
          ? {
              id: crew.id,
              name: crew.name,
              foreman_name: crew.foreman_name,
            }
          : null,
        readiness,
        flags,
      };
    });

    return new Response(
      JSON.stringify({ slots: enrichedSlots }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Production calendar error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

