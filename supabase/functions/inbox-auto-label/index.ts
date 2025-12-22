import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InboxSignal =
  | "positive"
  | "negative"
  | "neutral"
  | "question"
  | "unsubscribe"
  | "bounce"
  | "oof";

interface Payload {
  message_id: string;
  text?: string;
  signal: InboxSignal;
}

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  try {
    const { message_id, text, signal } = (await req.json()) as Payload;

    if (!message_id || !signal) {
      return respond({ ok: false, error: "message_id and signal required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const s = createClient(supabaseUrl, supabaseKey);

    // write inbox label
    const conf = signal === "unsubscribe" || signal === "bounce" || signal === "oof" ? 0.98 : 0.85;
    const { error } = await s.from("ai_inbox_labels").insert({
      message_id,
      inferred_label: signal,
      confidence: conf,
      source: "inbox-rule",
    });

    if (error) {
      return respond({ ok: false, error: error.message }, 500);
    }

    // reflect into ai_feedback so it joins training over time
    const { error: feedbackError } = await s.from("ai_feedback").insert({
      message_id,
      label: signal,
      confidence: conf,
      source: "user",
      notes: "auto from inbox",
    });

    if (feedbackError) {
      // log error but still succeed to avoid duplicate UI errors
      console.error("ai_feedback insert failed", feedbackError);
    }

    return respond({ ok: true });
  } catch (err) {
    console.error("inbox-auto-label error", err);
    return respond(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      500,
    );
  }
});

