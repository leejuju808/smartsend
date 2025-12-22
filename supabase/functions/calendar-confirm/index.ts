import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type Payload = {
  hold_id: string;
  attendee_name?: string;
  attendee_email?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = (await req.json()) as Payload;
    if (!payload.hold_id) {
      return jsonResponse({ error: "hold_id is required" }, 400);
    }

    const { data: hold, error: holdError } = await supabase
      .from("meeting_holds")
      .select("*")
      .eq("id", payload.hold_id)
      .maybeSingle();
    if (holdError) {
      return jsonResponse({ error: holdError.message }, 500);
    }
    if (!hold) {
      return jsonResponse({ error: "Hold not found" }, 404);
    }
    if (hold.status !== "hold") {
      return jsonResponse({ error: "Hold already processed" }, 409);
    }
    if (new Date(hold.expires_at) < new Date()) {
      return jsonResponse({ error: "Hold expired" }, 410);
    }

    const { data: calendar, error: calendarError } = await supabase
      .from("calendars")
      .select("id, provider")
      .eq("id", hold.calendar_id)
      .maybeSingle();
    if (calendarError) {
      return jsonResponse({ error: calendarError.message }, 500);
    }

    const confirmedEvent = await confirmProviderEvent(
      hold.calendar_id,
      hold.provider_event_id,
      hold.start_at,
      hold.end_at,
      [payload.attendee_email].filter(Boolean) as string[]
    );

    const attendees = [
      {
        name: payload.attendee_name ?? null,
        email: payload.attendee_email ?? null,
        role: "guest",
      },
    ];

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .insert({
        thread_id: hold.thread_id,
        hold_id: hold.id,
        start_at: hold.start_at,
        end_at: hold.end_at,
        attendees,
        location: confirmedEvent.meetUrl ?? null,
        provider: calendar?.provider ?? "google",
        provider_event_id: hold.provider_event_id,
      })
      .select("*")
      .maybeSingle();

    if (meetingError) {
      return jsonResponse({ error: meetingError.message }, 500);
    }

    await supabase.from("meeting_holds").update({ status: "booked" }).eq("id", hold.id);
    await supabase
      .from("meeting_holds")
      .update({ status: "canceled" })
      .eq("thread_id", hold.thread_id)
      .neq("id", hold.id);

    await supabase
      .from("inbox_threads")
      .update({ reply_type: "positive" })
      .eq("id", hold.thread_id);

    // Block 485: Update intent score when meeting is booked
    if (hold.thread_id) {
      // Get lead_id from thread
      const { data: thread } = await supabase
        .from("inbox_threads")
        .select("lead_id")
        .eq("id", hold.thread_id)
        .maybeSingle();

      if (thread?.lead_id) {
        // Call intent-score-update function asynchronously
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/intent-score-update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            lead_id: thread.lead_id,
            signal_type: "booking",
          }),
        }).catch((err) => {
          console.warn("[calendar-confirm] Failed to update intent score:", err);
        });
      }
    }

    return jsonResponse({ ok: true, meeting }, 200);
  } catch (error) {
    console.error("calendar-confirm error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

async function confirmProviderEvent(
  calendarId: string,
  eventId: string,
  start: string,
  end: string,
  attendees: string[]
) {
  // TODO: Update provider event via Google or Microsoft Graph APIs to confirm and add attendees / conferencing.
  void calendarId;
  void eventId;
  void start;
  void end;
  void attendees;
  return { id: eventId, meetUrl: null };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}






