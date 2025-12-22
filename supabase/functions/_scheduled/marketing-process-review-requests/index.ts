// Block 254900 — SmartSend Marketing Engine v1
// Scheduled Function: Process Review Requests
// Runs daily to send review request reminders for completed jobs

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  try {
    console.log("Processing review requests...");

    // 1. Find jobs completed in the last 7 days that need review requests
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const { data: completedJobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        roofing_company_id,
        status,
        completed_at
      `)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgoISO)
      .order("completed_at", { ascending: true });

    if (jobsError) {
      throw jobsError;
    }

    if (!completedJobs || completedJobs.length === 0) {
      console.log("No completed jobs found in the last 7 days");
      return new Response(
        JSON.stringify({ message: "No jobs to process", processed: 0 }),
        { status: 200 }
      );
    }

    console.log(`Found ${completedJobs.length} completed jobs to process`);

    let processed = 0;
    const errors: any[] = [];

    // 2. Process each job
    for (const job of completedJobs) {
      try {
        // Call review request function
        const response = await fetch(
          `${supabaseUrl}/functions/v1/marketing-review-request`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
            body: JSON.stringify({ job_id: job.id }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`Error processing job ${job.id}:`, errorData);
          errors.push({ job_id: job.id, error: errorData });
          continue;
        }

        processed++;
        console.log(`Processed review request for job ${job.id}`);
      } catch (error: any) {
        console.error(`Error processing job ${job.id}:`, error);
        errors.push({ job_id: job.id, error: error.message });
      }
    }

    console.log(`Processed ${processed} jobs, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        total_jobs: completedJobs.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in scheduled review request processor:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500 }
    );
  }
});






















