// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;

async function refreshGoogle(acc: Row) {
  if (!acc.refresh_token) return acc;
  if (
    acc.expires_at &&
    new Date(acc.expires_at) > new Date(Date.now() + 3 * 60 * 1000)
  ) {
    return acc;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: acc.refresh_token,
    }),
  });
  const j = await res.json();
  if (!res.ok) return acc;
  acc.access_token = j.access_token;
  acc.expires_at = new Date(
    Date.now() + ((j.expires_in ?? 3600) as number) * 1000
  ).toISOString();
  return acc;
}

async function fetchGoogleEvents(acc: Row, startISO: string, endISO: string) {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", startISO);
  url.searchParams.set("timeMax", endISO);
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${acc.access_token}` },
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.items || [])
    .map((e: any) => ({
      title: e.summary || "Busy",
      start:
        e.start?.dateTime ||
        (e.start?.date ? `${e.start.date}T00:00:00Z` : null),
      end:
        e.end?.dateTime ||
        (e.end?.date ? `${e.end.date}T00:00:00Z` : null),
    }))
    .filter((x: any) => x.start && x.end);
}

async function fetchOutlookEvents(acc: Row, startISO: string, endISO: string) {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  url.searchParams.set("startDateTime", startISO);
  url.searchParams.set("endDateTime", endISO);
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${acc.access_token}` },
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.value || [])
    .map((e: any) => ({
      title: e.subject || "Busy",
      start: e.start?.dateTime
        ? new Date(`${e.start.dateTime}Z`).toISOString()
        : null,
      end: e.end?.dateTime
        ? new Date(`${e.end.dateTime}Z`).toISOString()
        : null,
    }))
    .filter((x: any) => x.start && x.end);
}

Deno.serve(async () => {
  const sb = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };

  const accRes = await fetch(`${sb}/rest/v1/calendar_accounts?select=*`, {
    headers,
  });
  const accounts: Row[] = await accRes.json();

  const now = new Date();
  const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  for (const acc of accounts) {
    let a = acc;
    if (a.provider === "google") {
      a = await refreshGoogle(a);
    }

    let events: any[] = [];
    if (a.provider === "google") {
      events = await fetchGoogleEvents(a, start, end);
    } else if (a.provider === "outlook") {
      events = await fetchOutlookEvents(a, start, end);
    }

    if (!events.length) continue;

    for (const ev of events) {
      const span = `[${new Date(ev.start).toISOString()},${new Date(
        ev.end
      ).toISOString()})`;
      await fetch(`${sb}/rest/v1/rep_calendar_blocks`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            user_id: a.user_id,
            source: a.provider,
            title: ev.title?.slice(0, 200) || `${a.provider} busy`,
            time: span,
          },
        ]),
      });
    }

    await fetch(`${sb}/rest/v1/calendar_sync_state`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          user_id: a.user_id,
          provider: a.provider,
          last_synced_at: new Date().toISOString(),
        },
      ]),
    });
  }

  return new Response(
    JSON.stringify({ ok: true, n: accounts.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});


