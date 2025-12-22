import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildThreadKey, safeLower } from "../_lib/reply-utils.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

type GmailPayload = {
  thread_id: string;
  campaign_id?: string | null;
  lead_id?: string | null;
  headers?: Record<string, string>;
  body_text?: string | null;
  external_id?: string | null;
  received_at?: string | null;
};

serve(async (req) => {
  try {
    const payload = (await req.json()) as GmailPayload;

    const headers = payload.headers ?? {};
    const messageId = headers["Message-Id"] ?? headers["Message-ID"] ?? null;
    const inReplyTo = headers["In-Reply-To"] ?? null;
    const references = headers["References"] ?? null;
    const from = headers["From"] ?? "";
    const to = headers["To"] ?? "";

    // Dedupe by provider/external_id or message_id
    if (payload.external_id) {
      const { data: byExternal, error: byExternalError } = await supabase
        .from("inbox_messages")
        .select("id")
        .eq("provider", "gmail")
        .eq("external_id", payload.external_id)
        .limit(1);
      if (byExternalError) throw byExternalError;
      if ((byExternal ?? []).length) {
        return new Response(JSON.stringify({ ok: true, dedupe: true }), { status: 200 });
      }
    }

    if (messageId) {
      const { data: byMessage, error: byMessageError } = await supabase
        .from("inbox_messages")
        .select("id")
        .eq("message_id", messageId)
        .limit(1);
      if (byMessageError) throw byMessageError;
      if ((byMessage ?? []).length) {
        return new Response(JSON.stringify({ ok: true, dedupe: true }), { status: 200 });
      }
    }

    const threadKey = buildThreadKey({
      messageId,
      inReplyTo,
      references,
      from,
      to,
    });

    const insertPayload = {
      id: crypto.randomUUID(),
      provider: "gmail",
      external_id: payload.external_id ?? null,
      thread_id: payload.thread_id,
      direction: "inbound",
      body_text: payload.body_text ?? "",
      created_at: payload.received_at ?? new Date().toISOString(),
      message_id: messageId,
      in_reply_to: inReplyTo,
      refs: references,
      thread_key: threadKey,
      from_email: safeLower(from),
      to_email: safeLower(to),
    };

    const { error: insertError } = await supabase.from("inbox_messages").insert(insertPayload);
    if (insertError) throw insertError;

    const { data: siblings, error: siblingsError } = await supabase
      .from("inbox_messages")
      .select("thread_id")
      .eq("thread_key", threadKey)
      .neq("thread_id", payload.thread_id)
      .limit(1);
    if (siblingsError) throw siblingsError;

    if (siblings && siblings.length) {
      const sourceThread = siblings[0].thread_id;
      const { error: mergeError } = await supabase.rpc("merge_threads", {
        p_src: sourceThread,
        p_dst: payload.thread_id,
      });
      if (mergeError) throw mergeError;
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("system_logs")
      .insert({
        category: "webhook",
        level: "error",
        message: "gmail webhook fail",
        meta: { err: message },
      })
      .catch(() => {});
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
});






