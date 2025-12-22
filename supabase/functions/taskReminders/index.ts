import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supa = createClient(supabaseUrl, supabaseServiceKey);

    // Find overdue or due-now tasks within next 5 minutes
    const now = new Date();
    const windowTo = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const { data: tasks, error } = await supa
      .from("inbox_tasks")
      .select("id, org_id, title, notes, assignee_id, due_at, campaign_id, lead_id")
      .eq("status", "open")
      .lte("due_at", windowTo);

    if (error) {
      console.error("Error fetching tasks:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let notificationCount = 0;

    for (const t of tasks || []) {
      // Write an in-app notification via campaign_logs
      const { error: logError } = await supa.from("campaign_logs").insert({
        org_id: t.org_id,
        campaign_id: t.campaign_id,
        lead_id: t.lead_id,
        action: "task_due",
        message: `Task due: ${t.title}`,
      });

      if (!logError) {
        notificationCount++;
      } else {
        console.error(`Error logging task reminder for task ${t.id}:`, logError);
      }

      // Optional: send email or webhook here
      // TODO: Add email/webhook notification logic if needed
    }

    return new Response(
      JSON.stringify({ ok: true, count: notificationCount, tasksProcessed: tasks?.length ?? 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

