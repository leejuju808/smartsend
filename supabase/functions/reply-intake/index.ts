// supabase/functions/reply-intake/index.ts
// Deploy with: supabase functions deploy reply-intake
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function extractAngle(str: string | undefined | null) {
  if (!str) return null;
  const m = str.match(/<[^>]+>/);
  return m ? m[0] : null;
}

function parseRefs(str: string | undefined | null) {
  if (!str) return [];
  return (str.match(/<[^>]+>/g) || []).slice(0, 50);
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const headers = (body.headers || {}) as Record<string, string>;

    const inReply = extractAngle(headers["in-reply-to"] || headers["In-Reply-To"]);
    const refs = parseRefs(headers["references"] || headers["References"]);
    const threadKey = headers["X-Gmail-Thread-Id"] || headers["thread-id"] || headers["ConversationId"] || null;

    const payload: Record<string, any> = {
      account_id: body.account_id,
      lead_id: body.lead_id,
      campaign_id: body.campaign_id ?? null,
      raw_excerpt: body.text_excerpt?.slice(0, 2000) ?? null,
      in_reply_to: inReply,
      references_arr: refs.length ? refs : null,
      thread_key: threadKey
    };

    if (body.provider_message_id) {
      payload.provider_msg_id = body.provider_message_id;
    }
    if (body.provider_thread_id) {
      payload.provider_thread_id = body.provider_thread_id;
    }

    const { data: inserted, error } = await sb
      .from("reply_events")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    const replyId = inserted?.id;
    let parentQueueId: string | null = null;

    if (replyId) {
      const { data: parent, error: rpcError } = await sb.rpc("link_reply_to_parent", { p_reply: replyId });
      if (rpcError) {
        console.error("link_reply_to_parent error", rpcError);
      } else if (typeof parent === "string" || parent === null) {
        parentQueueId = parent;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      reply_event_id: replyId,
      parent_queue_id: parentQueueId
    }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "SERVER_ERROR",
      detail: String(err)
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});



