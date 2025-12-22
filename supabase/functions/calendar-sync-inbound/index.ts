// Block 282 — Calendar Sync v1: Inbound Sync
// Polls Google Calendar / Outlook for changes → updates SmartSend meetings

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type CalendarConnection = {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: "google" | "outlook";
  account_email: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  calendar_id: string;
  last_synced_at: string | null;
};

type CalendarEvent = {
  id: string;
  summary?: string;
  subject?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
  };
  status?: string;
  cancelled?: boolean;
};

// Refresh Google OAuth token
async function refreshGoogleToken(conn: CalendarConnection): Promise<CalendarConnection> {
  if (!conn.refresh_token) {
    throw new Error("No refresh token available");
  }

  if (conn.expires_at && new Date(conn.expires_at) > new Date(Date.now() + 3 * 60 * 1000)) {
    return conn;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to refresh Google token: ${error}`);
  }

  const data = await res.json();
  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();

  await supabase
    .from("calendar_connections")
    .update({
      access_token: data.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return {
    ...conn,
    access_token: data.access_token,
    expires_at: newExpiresAt,
  };
}

// Refresh Outlook OAuth token
async function refreshOutlookToken(conn: CalendarConnection): Promise<CalendarConnection> {
  if (!conn.refresh_token) {
    throw new Error("No refresh token available");
  }

  if (conn.expires_at && new Date(conn.expires_at) > new Date(Date.now() + 3 * 60 * 1000)) {
    return conn;
  }

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      scope: "https://graph.microsoft.com/Calendars.ReadWrite",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to refresh Outlook token: ${error}`);
  }

  const data = await res.json();
  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();

  await supabase
    .from("calendar_connections")
    .update({
      access_token: data.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return {
    ...conn,
    access_token: data.access_token,
    expires_at: newExpiresAt,
  };
}

// Fetch Google Calendar events
async function fetchGoogleEvents(
  conn: CalendarConnection,
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  const calendarId = conn.calendar_id || "primary";
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", startISO);
  url.searchParams.set("timeMax", endISO);
  url.searchParams.set("maxResults", "250");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${conn.access_token}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch Google events: ${error}`);
  }

  const data = await res.json();
  return (data.items || []) as CalendarEvent[];
}

// Fetch Outlook Calendar events
async function fetchOutlookEvents(
  conn: CalendarConnection,
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  url.searchParams.set("startDateTime", startISO);
  url.searchParams.set("endDateTime", endISO);
  url.searchParams.set("$top", "250");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${conn.access_token}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch Outlook events: ${error}`);
  }

  const data = await res.json();
  return (data.value || []) as CalendarEvent[];
}

// Parse event time
function parseEventTime(event: CalendarEvent): { start: string | null; end: string | null } {
  if (event.start?.dateTime) {
    return {
      start: new Date(event.start.dateTime).toISOString(),
      end: event.end?.dateTime ? new Date(event.end.dateTime).toISOString() : null,
    };
  } else if (event.start?.date) {
    // All-day event
    const startDate = new Date(event.start.date);
    const endDate = event.end?.dateTime
      ? new Date(event.end.dateTime)
      : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  }
  return { start: null, end: null };
}

// Main handler
Deno.serve(async () => {
  try {
    const now = new Date();
    const startISO = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const endISO = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days ahead

    // Get all active calendar connections
    const { data: connections, error: connError } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("is_active", true);

    if (connError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch connections", details: connError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No active connections" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let updated = 0;
    let errors = 0;

    for (const conn of connections as CalendarConnection[]) {
      try {
        // Refresh token if needed
        let refreshedConn = conn;
        if (conn.provider === "google") {
          refreshedConn = await refreshGoogleToken(conn);
        } else if (conn.provider === "outlook") {
          refreshedConn = await refreshOutlookToken(conn);
        }

        // Fetch events
        let events: CalendarEvent[] = [];
        if (refreshedConn.provider === "google") {
          events = await fetchGoogleEvents(refreshedConn, startISO, endISO);
        } else if (refreshedConn.provider === "outlook") {
          events = await fetchOutlookEvents(refreshedConn, startISO, endISO);
        }

        // Process each event
        for (const event of events) {
          // Check if this event matches a SmartSend meeting
          const { data: meetings } = await supabase
            .from("meetings")
            .select("*")
            .eq("calendar_event_id", event.id)
            .eq("calendar_provider", refreshedConn.provider)
            .eq("owner_id", refreshedConn.user_id)
            .limit(1);

          if (meetings && meetings.length > 0) {
            const meeting = meetings[0];
            const { start, end } = parseEventTime(event);

            // Check if event is cancelled
            const isCancelled =
              event.status === "cancelled" ||
              event.cancelled === true ||
              (refreshedConn.provider === "outlook" && event.status === "cancelled");

            if (isCancelled) {
              // Mark meeting as cancelled
              await supabase
                .from("meetings")
                .update({
                  calendar_status: "cancelled",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", meeting.id);

              // Log activity
              if (meeting.lead_id) {
                await supabase.from("lead_activity").insert({
                  workspace_id: meeting.workspace_id,
                  lead_id: meeting.lead_id,
                  type: "meeting_cancelled",
                  title: "Meeting cancelled",
                  body: `Meeting "${meeting.title}" was cancelled in calendar`,
                  metadata: { meeting_id: meeting.id, calendar_provider: refreshedConn.provider },
                  occurred_at: new Date().toISOString(),
                });

                await supabase.from("team_activity").insert({
                  workspace_id: meeting.workspace_id,
                  user_id: meeting.owner_id,
                  lead_id: meeting.lead_id,
                  type: "meeting_cancelled",
                  title: "Meeting cancelled",
                  body: `Meeting "${meeting.title}" was cancelled in calendar`,
                  metadata: { meeting_id: meeting.id, calendar_provider: refreshedConn.provider },
                  occurred_at: new Date().toISOString(),
                });
              }

              updated++;
            } else if (start && end) {
              // Check if time changed
              const meetingStart = meeting.start_time
                ? new Date(meeting.start_time).toISOString()
                : null;
              const meetingEnd = meeting.end_time ? new Date(meeting.end_time).toISOString() : null;

              if (meetingStart !== start || meetingEnd !== end) {
                // Update meeting time
                await supabase
                  .from("meetings")
                  .update({
                    start_time: start,
                    end_time: end,
                    calendar_status: "synced",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", meeting.id);

                // Log activity
                if (meeting.lead_id) {
                  const oldTime = meeting.start_time
                    ? new Date(meeting.start_time).toLocaleString()
                    : "TBD";
                  const newTime = new Date(start).toLocaleString();

                  await supabase.from("lead_activity").insert({
                    workspace_id: meeting.workspace_id,
                    lead_id: meeting.lead_id,
                    type: "meeting_rescheduled",
                    title: "Meeting rescheduled",
                    body: `Meeting "${meeting.title}" moved from ${oldTime} to ${newTime}`,
                    metadata: {
                      meeting_id: meeting.id,
                      calendar_provider: refreshedConn.provider,
                      old_start_time: meeting.start_time,
                      new_start_time: start,
                    },
                    occurred_at: new Date().toISOString(),
                  });

                  await supabase.from("team_activity").insert({
                    workspace_id: meeting.workspace_id,
                    user_id: meeting.owner_id,
                    lead_id: meeting.lead_id,
                    type: "meeting_rescheduled",
                    title: "Meeting rescheduled",
                    body: `Meeting "${meeting.title}" moved from ${oldTime} to ${newTime} by calendar change`,
                    metadata: {
                      meeting_id: meeting.id,
                      calendar_provider: refreshedConn.provider,
                      old_start_time: meeting.start_time,
                      new_start_time: start,
                    },
                    occurred_at: new Date().toISOString(),
                  });

                  // Create notification
                  await supabase.from("notifications").insert({
                    workspace_id: meeting.workspace_id,
                    user_id: meeting.owner_id,
                    type: "meeting_rescheduled",
                    title: "Meeting rescheduled",
                    body: `Your meeting "${meeting.title}" was moved to ${newTime} by calendar change`,
                    link: `/meetings/${meeting.id}`,
                    read: false,
                    created_at: new Date().toISOString(),
                  });
                }

                updated++;
              }
            }
          }
        }

        // Update last_synced_at
        await supabase
          .from("calendar_connections")
          .update({
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conn.id);

        processed++;
      } catch (error) {
        console.error(`Error processing connection ${conn.id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        updated,
        errors,
        timestamp: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});








