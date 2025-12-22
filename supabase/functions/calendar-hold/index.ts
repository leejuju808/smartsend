import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type Slot = { start: string; end: string };

type Payload = {
  thread_id: string;
  calendar_id: string;
  slots: Slot[];
  title?: string;
  description?: string;
  expires_hours?: number;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = (await req.json()) as Payload;
    if (!payload.thread_id || !payload.calendar_id || !payload.slots?.length) {
      return jsonResponse({ error: "thread_id, calendar_id, and slots are required" }, 400);
    }

    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id, lead_id")
      .eq("id", payload.thread_id)
      .maybeSingle();
    if (threadError) {
      return jsonResponse({ error: threadError.message }, 500);
    }
    if (!thread) {
      return jsonResponse({ error: "Thread not found" }, 404);
    }

    const expiresHours = payload.expires_hours ?? 72;
    const expiresAtIso = () =>
      new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

    const created: any[] = [];
    for (const slot of payload.slots) {
      const event = await createProviderEvent(
        payload.calendar_id,
        slot.start,
        slot.end,
        payload.title ?? "Hold - Intro Call",
        payload.description ?? "Temporary hold for SmartSend meeting"
      );

      const { data: inserted, error: insertError } = await supabase
        .from("meeting_holds")
        .insert({
          thread_id: payload.thread_id,
          lead_id: thread.lead_id,
          campaign_id: thread.campaign_id,
          calendar_id: payload.calendar_id,
          start_at: slot.start,
          end_at: slot.end,
          provider_event_id: event.id,
          status: "hold",
          expires_at: expiresAtIso(),
        })
        .select("*")
        .maybeSingle();

      if (insertError) {
        console.error("meeting_holds insert error", insertError);
        return jsonResponse({ error: insertError.message }, 500);
      }
      created.push(inserted);
    }

    const blocks = created.map((hold) => ({
      label: toReadable(hold.start_at, hold.end_at),
      url: `${Deno.env.get("PUBLIC_APP_URL")}/book?hold=${hold.id}`,
    }));

    return jsonResponse({ holds: created, blocks }, 200);
  } catch (error) {
    console.error("calendar-hold error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function toReadable(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toUTCString().slice(0, 22)} -> ${e.toUTCString().slice(17, 22)} UTC`;
}

async function createProviderEvent(
  calendarId: string,
  start: string,
  end: string,
  title: string,
  description: string
) {
  // TODO: Integrate with Google Calendar or Microsoft Graph APIs to create tentative/transparent events.
  void calendarId;
  void start;
  void end;
  void title;
  void description;
  return { id: crypto.randomUUID(), meetUrl: null };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

