++ 0
// Deno Edge function: push finalized meeting intents to calendar providers or fall back to ICS download
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PushMode = "ics_only" | "ics_only_mismatch" | "provider" | "already_sent";

type MeetingIntent = {
  id: string;
  account_id: string | null;
  start_ts: string | null;
  end_ts: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  timezone: string | null;
  location_url: string | null;
  location_label: string | null;
  ics_text: string | null;
  push_provider: "google" | "outlook" | "none";
  external_event_id: string | null;
  push_status: "pending" | "drafted" | "sent" | "failed" | null;
};

type AccountIntegration = {
  provider: "google" | "outlook" | "none";
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = await req.json().catch(() => ({}));
    const intentId = payload?.intent_id as string | undefined;

    if (!intentId) {
      return json({ ok: false, error: "missing_intent_id" }, 400);
    }

    const { data: intent, error: intentError } = await supa
      .from("meeting_intents")
      .select(
        "id,account_id,start_ts,end_ts,organizer_name,organizer_email,timezone,location_url,location_label,ics_text,push_provider,external_event_id,push_status",
      )
      .eq("id", intentId)
      .single<MeetingIntent>();

    if (intentError || !intent) {
      return json({ ok: false, error: "intent_not_found" }, 404);
    }

    if ((intent.push_status === "sent" || intent.push_status === "drafted") && intent.external_event_id) {
      return json({ ok: true, mode: "already_sent" as PushMode, external_event_id: intent.external_event_id });
    }

    if (!intent.ics_text) {
      return json({ ok: false, error: "intent_missing_ics" }, 400);
    }

    let conn: AccountIntegration | null = null;
    if (intent.account_id) {
      const { data } = await supa
        .from("account_integrations")
        .select("provider,access_token,refresh_token,expires_at")
        .eq("account_id", intent.account_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<AccountIntegration>();
      conn = data ?? null;
    }

    const nowIso = new Date().toISOString();

    // 2) If no provider or none selected, just mark drafted (download-only)
    if (!conn || intent.push_provider === "none") {
      await supa
        .from("meeting_intents")
        .update({ push_status: "drafted", pushed_at: nowIso })
        .eq("id", intentId);
      return json({ ok: true, mode: "ics_only" as PushMode });
    }

    let externalId: string | null = null;

    // 3) Provider switch
    if (conn.provider === "google" && intent.push_provider === "google") {
      externalId = await pushGoogle(conn.access_token, intent);
    } else if (conn.provider === "outlook" && intent.push_provider === "outlook") {
      externalId = await pushOutlook(conn.access_token, intent);
    } else {
      // mismatched connection/provider → fallback to ICS only
      await supa
        .from("meeting_intents")
        .update({ push_status: "drafted", pushed_at: nowIso })
        .eq("id", intentId);
      return json({ ok: true, mode: "ics_only_mismatch" as PushMode });
    }

    if (externalId) {
      await supa
        .from("meeting_intents")
        .update({
          push_status: "sent",
          external_event_id: externalId,
          pushed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", intentId);
      return json({ ok: true, mode: "provider" as PushMode, external_event_id: externalId });
    }

    await supa
      .from("meeting_intents")
      .update({ push_status: "failed", pushed_at: nowIso, updated_at: nowIso })
      .eq("id", intentId);
    return json({ ok: false, error: "provider_push_failed" }, 500);
  } catch (error) {
    console.error("meeting-bridge-push error", error);
    return json({ ok: false, error: String(error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// -------- Provider stubs (replace with production calls) --------
async function pushGoogle(accessToken: string, intent: MeetingIntent): Promise<string | null> {
  // Minimal Google Calendar insert (Events.insert)
  // Docs: https://developers.google.com/calendar/api/v3/reference/events/insert
  const payload = {
    summary: "Intro call",
    description: "Created via SmartSend Meeting Bridge",
    start: { dateTime: intent.start_ts ?? new Date().toISOString() },
    end: { dateTime: intent.end_ts ?? new Date(Date.now() + 30 * 60_000).toISOString() },
    location: intent.location_url ?? intent.location_label ?? undefined,
  };
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json as { id?: string }).id ?? null;
}

async function pushOutlook(accessToken: string, intent: MeetingIntent): Promise<string | null> {
  // Minimal Outlook (Microsoft Graph) create event
  // Docs: https://learn.microsoft.com/graph/api/user-post-events
  const payload = {
    subject: "Intro call",
    body: { contentType: "HTML", content: "Created via SmartSend Meeting Bridge" },
    start: { dateTime: intent.start_ts ?? new Date().toISOString(), timeZone: intent.timezone ?? "UTC" },
    end: {
      dateTime: intent.end_ts ?? new Date(Date.now() + 30 * 60_000).toISOString(),
      timeZone: intent.timezone ?? "UTC",
    },
    location: { displayName: intent.location_label ?? intent.location_url ?? "" },
  };
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json as { id?: string }).id ?? null;
}


