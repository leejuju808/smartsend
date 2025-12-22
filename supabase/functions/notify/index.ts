import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { user_id, workspace_id, type, title, body, link } = payload;

    if (!user_id || !workspace_id || !type || !title) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, workspace_id, type, title" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { error } = await supabase.from("notifications").insert({
      user_id,
      workspace_id,
      type,
      title,
      body,
      link,
    });

    if (error) {
      console.error("Error creating notification:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Notify function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});










