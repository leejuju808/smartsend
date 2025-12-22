// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type NormalizedMessage = {
  id: string;
  direction: string;
  linked_thread_id: string;
  ai_label?: string | null;
  sent_at: string;
};

type Assignment = {
  id: string;
  send_queue_id: string | null;
  campaign_id: string;
  scenario: string | null;
  variant_id: string;
  tone: string | null;
  created_at: string;
};

Deno.serve(async (req) => {
  const env = (key: string) => {
    const value = Deno.env.get(key);
    if (!value) throw new Error(`Missing env ${key}`);
    return value;
  };

  const sb = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
    "Content-Type": "application/json",
  };

  const payload = await req.json().catch(() => ({}));
  const record: NormalizedMessage | null =
    payload?.type === "INSERT" ? (payload.record as NormalizedMessage) : (payload as NormalizedMessage);
  if (!record || record.direction !== "inbound") {
    return new Response(JSON.stringify({ ok: true, skip: true }), { headers });
  }

  const threadId = record.linked_thread_id;
  if (!threadId) {
    return new Response(JSON.stringify({ ok: true, skip: "no_thread" }), { headers });
  }

  const assignmentRes = await fetch(
    `${sb}/rest/v1/nudge_assignments?select=id,send_queue_id,campaign_id,scenario,variant_id,tone,created_at&thread_id=eq.${threadId}&order=created_at.desc&limit=1`,
    { headers },
  );
  if (!assignmentRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "assign_lookup", status: assignmentRes.status }), {
      headers,
      status: 500,
    });
  }
  const assignmentList: Assignment[] = await assignmentRes.json();
  const assignment = assignmentList?.[0];
  if (!assignment) {
    return new Response(JSON.stringify({ ok: true, noassign: true }), { headers });
  }

  const label = record.ai_label ?? "human_reply";
  const messageId = assignment.send_queue_id;

  if (!messageId) {
    return new Response(JSON.stringify({ ok: true, skip: "no_message" }), { headers });
  }

  const rpcRes = await fetch(`${sb}/rest/v1/rpc/nudge_record_outcome`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_message: messageId,
      p_campaign: assignment.campaign_id,
      p_scenario: assignment.scenario ?? "no_reply",
      p_variant: assignment.variant_id,
      p_replied: true,
      p_reply_label: label,
      p_meta: {
        source: "nudge-attribute",
        normalized_message_id: record.id,
        assignment_id: assignment.id,
      },
    }),
  });

  if (!rpcRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: "nudge_record_outcome", status: rpcRes.status }), {
      headers,
      status: 500,
    });
  }

  const successLabels = new Set(["positive", "meeting_intent", "neutral"]);
  if (assignment.tone && successLabels.has(label)) {
    const functionHeaders = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };

    try {
      await fetch(`${sb}/functions/v1/nudge-feedback`, {
        method: "POST",
        headers: functionHeaders,
        body: JSON.stringify({
          label,
          tone: assignment.tone,
          success: true,
        }),
      });
    } catch (error) {
      console.error("nudge-feedback call failed", error);
    }
  }

  return new Response(JSON.stringify({ ok: true, updated: true }), { headers });
});

