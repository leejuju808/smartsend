import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { org_id, message } = await req.json();

    if (!org_id || !message) {
      return new Response(
        JSON.stringify({ error: "org_id and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1️⃣ Fetch settings
    const { data: s, error: settingsError } = await supabase
      .from("autopilot_settings")
      .select("*")
      .eq("org_id", org_id)
      .single();

    if (settingsError || !s) {
      return new Response(
        JSON.stringify({ error: "Autopilot settings not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!s.enabled) {
      return new Response(
        JSON.stringify({ error: "Autopilot off", allowed: false }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2️⃣ Enforce quiet hours
    const now = new Date();
    const localHour = now.getUTCHours(); // Using UTC for consistency, can be adjusted for timezone
    const qStart = parseInt(s.quiet_hours.start.split(":")[0] || "22");
    const qEnd = parseInt(s.quiet_hours.end.split(":")[0] || "6");

    // Check if current hour is within quiet hours (assuming quiet hours span midnight)
    if (qStart > qEnd) {
      // Quiet hours span midnight (e.g., 22:00 to 06:00)
      if (localHour >= qStart || localHour < qEnd) {
        return new Response(
          JSON.stringify({ error: "Quiet hours", allowed: false }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      // Quiet hours within same day (e.g., 10:00 to 18:00)
      if (localHour >= qStart && localHour < qEnd) {
        return new Response(
          JSON.stringify({ error: "Quiet hours", allowed: false }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 3️⃣ Check daily send limit
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    
    const { count, error: countError } = await supabase
      .from("channel_messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id)
      .eq("direction", "outbound")
      .gte("sent_at", todayStart.toISOString());

    if (countError) {
      console.error("Error counting messages:", countError);
      // Allow through if count fails - better to err on the side of caution
    } else if (count !== null && count >= s.daily_send_limit) {
      return new Response(
        JSON.stringify({ 
          error: "Daily limit reached", 
          count,
          limit: s.daily_send_limit,
          allowed: false 
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4️⃣ Offensive / spam filter (basic)
    const banned = ["refund", "bitcoin", "loan", "password"];
    const messageLower = message.toLowerCase();
    if (banned.some((b) => messageLower.includes(b))) {
      return new Response(
        JSON.stringify({ error: "Blocked by filter", allowed: false }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5️⃣ Review mode
    if (s.review_mode) {
      const { error: queueError } = await supabase
        .from("ai_review_queue")
        .insert({
          org_id,
          draft: message,
          status: "pending",
        });

      if (queueError) {
        console.error("Error queuing for review:", queueError);
        return new Response(
          JSON.stringify({ error: "Failed to queue for review" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          message: "Queued for review",
          requires_review: true,
          allowed: false
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: "Allowed",
        allowed: true 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in autopilot-guardrail:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

