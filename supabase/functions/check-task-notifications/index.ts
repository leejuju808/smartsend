// Block 13400 — Task Notification Cron Job
// Checks for tasks due today and overdue tasks, creates notifications

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call database function to check and notify due tasks
    const { data: dueTasks, error: dueError } = await supabase.rpc(
      "check_and_notify_due_tasks"
    );

    if (dueError) {
      console.error("Error checking due tasks:", dueError);
    } else {
      console.log(`Checked due tasks`);
    }

    // Call database function to check and notify overdue tasks
    const { data: overdueTasks, error: overdueError } = await supabase.rpc(
      "check_and_notify_overdue_tasks"
    );

    if (overdueError) {
      console.error("Error checking overdue tasks:", overdueError);
    } else {
      console.log(`Checked overdue tasks`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dueTasksChecked: true,
        overdueTasksChecked: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in task notification cron:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});



























































