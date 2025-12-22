// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// Training Data Ingestion Edge Function

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface JobHistoryRecord {
  workspace_id: string;
  company_id?: string;
  job_value: number;
  job_type?: string;
  zipcode?: string;
  source?: string;
  persona_used?: string;
  campaign_id?: string;
  response_time_minutes?: number;
  estimate_speed_minutes?: number;
  weather_condition?: string;
  storm_category?: string;
  closed: boolean;
  closed_at?: string;
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { records, workspace_id } = body;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: workspace_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!records || !Array.isArray(records) || records.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or empty records array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate and prepare records
    const validatedRecords: JobHistoryRecord[] = records.map((record: any) => {
      if (!record.job_value || typeof record.job_value !== "number") {
        throw new Error("Each record must have a numeric job_value");
      }
      if (typeof record.closed !== "boolean") {
        throw new Error("Each record must have a boolean closed field");
      }

      return {
        workspace_id,
        company_id: record.company_id || null,
        job_value: record.job_value,
        job_type: record.job_type || null,
        zipcode: record.zipcode || null,
        source: record.source || "unknown",
        persona_used: record.persona_used || null,
        campaign_id: record.campaign_id || null,
        response_time_minutes: record.response_time_minutes || null,
        estimate_speed_minutes: record.estimate_speed_minutes || null,
        weather_condition: record.weather_condition || null,
        storm_category: record.storm_category || null,
        closed: record.closed,
        closed_at: record.closed_at || null,
        metadata: record.metadata || {},
      };
    });

    // Insert records in batches (Supabase has limits)
    const batchSize = 100;
    let inserted = 0;
    let errors: any[] = [];

    for (let i = 0; i < validatedRecords.length; i += batchSize) {
      const batch = validatedRecords.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from("job_history_training")
        .insert(batch)
        .select("id");

      if (error) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
        errors.push({
          batch: i / batchSize + 1,
          error: error.message,
        });
      } else {
        inserted += data?.length || 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        total: validatedRecords.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in ingest-job-history:", error);
    return new Response(
      JSON.stringify({ error: error.message || String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



























