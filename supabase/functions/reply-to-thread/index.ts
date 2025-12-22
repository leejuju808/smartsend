import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const { thread_id, from, to, subject, body_html } = await req.json();

    if (!thread_id || !from || !to || !body_html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: msg, error } = await supabase
      .from("email_messages")
      .insert({
        thread_id,
        from_address: from,
        to_address: to,
        subject: subject || null,
        body_html,
        direction: "sent"
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error inserting message:", error);
      return new Response(JSON.stringify(error), { 
        status: 400, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    await supabase
      .from("email_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread_id);

    return new Response(JSON.stringify(msg), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

