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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Create no-reply re-engagement tasks
    const { error: noReplyError } = await supabase.rpc("create_no_reply_tasks");

    if (noReplyError) {
      console.error("Error creating no-reply tasks:", noReplyError);
    } else {
      console.log("No-reply tasks check completed");
    }

    // 2. Create task due notifications
    const { error: notificationError } = await supabase.rpc(
      "create_task_due_notifications"
    );

    if (notificationError) {
      console.error("Error creating task due notifications:", notificationError);
    } else {
      console.log("Task due notifications check completed");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Tasks maintenance completed",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in tasks-maintenance-cron:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});





























































