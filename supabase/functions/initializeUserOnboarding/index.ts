// initializeUserOnboarding
// Trigger: on user signup via Supabase Auth webhook or database trigger

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get user from request (can be from webhook or direct call)
    let user_id: string;
    
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      // Handle webhook format: { type: 'user.created', record: { id: '...' } }
      if (body.record?.id) {
        user_id = body.record.id;
      } else if (body.user_id) {
        user_id = body.user_id;
      } else if (body.user?.id) {
        user_id = body.user.id;
      } else {
        return new Response(
          JSON.stringify({ error: "Missing user_id" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid request format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 1. Fetch all global onboarding tasks
    const { data: tasks, error: tasksError } = await supabase
      .from("onboarding_tasks")
      .select("*")
      .order("order_index");

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tasks", details: tasksError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!tasks || tasks.length === 0) {
      console.warn("No onboarding tasks found in database");
      return new Response(
        JSON.stringify({ error: "No onboarding tasks configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 2. Insert into user progress table
    const progressRows = tasks.map((t) => ({
      user_id,
      task_id: t.id,
      completed: false,
    }));

    const { error: insertError } = await supabase
      .from("user_onboarding_progress")
      .insert(progressRows);

    if (insertError) {
      console.error("Error inserting progress:", insertError);
      // Check if it's a duplicate key error (user already has progress)
      if (insertError.code === "23505") {
        return new Response(
          JSON.stringify({ status: "ok", message: "Onboarding already initialized" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to initialize progress", details: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 3. Set first_login flag on profiles table
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ first_login: true })
      .eq("id", user_id);

    if (updateError) {
      console.error("Error updating first_login:", updateError);
      // Don't fail the whole operation if this fails
    }

    return new Response(
      JSON.stringify({ 
        status: "ok", 
        message: "Onboarding initialized",
        tasks_created: progressRows.length 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});


























