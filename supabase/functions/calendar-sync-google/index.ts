// Block 18400 — Google Calendar Sync Worker
// Syncs Google Calendar events every 60 seconds for real-time availability

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type CalendarConnection = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: "google" | "outlook";
  account_email: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  calendar_id: string;
  last_synced_at: string | null;
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: string;
  transparency?: string;
  attendees?: Array<{
    email: string;
    responseStatus?: string;
  }>;
  organizer?: {
    email: string;
  };
};

// Refresh Google OAuth token
async function refreshGoogleToken(conn: CalendarConnection): Promise<CalendarConnection> {
  if (!conn.refresh_token) {
    throw new Error("No refresh token available");
  }

  // Check if token is still valid (with 3 minute buffer)
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

// Fetch Google Calendar events
async function fetchGoogleEvents(
  conn: CalendarConnection,
  startISO: string,
  endISO: string
): Promise<GoogleCalendarEvent[]> {
  const calendarId = conn.calendar_id || "primary";
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", startISO);
  url.searchParams.set("timeMax", endISO);
  url.searchParams.set("maxResults", "250");
  url.searchParams.set("showDeleted", "true"); // Include deleted events to sync deletions

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${conn.access_token}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch Google events: ${error}`);
  }

  const data = await res.json();
  return (data.items || []) as GoogleCalendarEvent[];
}

// Parse event time
function parseEventTime(event: GoogleCalendarEvent): { start: string | null; end: string | null } {
  if (event.start?.dateTime) {
    return {
      start: new Date(event.start.dateTime).toISOString(),
      end: event.end?.dateTime ? new Date(event.end.dateTime).toISOString() : null,
    };
  } else if (event.start?.date) {
    // All-day event
    const startDate = new Date(event.start.date);
    const endDate = event.end?.date
      ? new Date(event.end.date)
      : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  }
  return { start: null, end: null };
}

// Determine busy type from event
function getBusyType(event: GoogleCalendarEvent): "free" | "busy" | "tentative" | "out_of_office" {
  // Check transparency (free/busy)
  if (event.transparency === "transparent") {
    return "free";
  }

  // Check status
  if (event.status === "cancelled") {
    return "busy"; // Will be filtered out
  }

  // Check for out-of-office indicators in summary/description
  const summary = (event.summary || "").toLowerCase();
  const description = (event.description || "").toLowerCase();
  
  if (
    summary.includes("out of office") ||
    summary.includes("ooo") ||
    summary.includes("vacation") ||
    summary.includes("pto") ||
    description.includes("out of office")
  ) {
    return "out_of_office";
  }

  // Check for tentative status
  if (event.status === "tentative") {
    return "tentative";
  }

  // Default to busy
  return "busy";
}

// Main handler
Deno.serve(async () => {
  try {
    const now = new Date();
    // Sync events from 2 days ago to 30 days ahead
    const startISO = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endISO = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get all active Google Calendar connections
    const { data: connections, error: connError } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("is_active", true)
      .eq("provider", "google");

    if (connError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch connections", details: connError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No active Google Calendar connections" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let synced = 0;
    let deleted = 0;
    let errors = 0;

    for (const conn of connections as CalendarConnection[]) {
      try {
        // Refresh token if needed
        const refreshedConn = await refreshGoogleToken(conn);

        // Fetch events
        const events = await fetchGoogleEvents(refreshedConn, startISO, endISO);

        // Process each event
        for (const event of events) {
          const { start, end } = parseEventTime(event);

          if (!start || !end) {
            continue; // Skip events without valid times
          }

          // Check if event is cancelled/deleted
          const isCancelled = event.status === "cancelled";

          if (isCancelled) {
            // Mark as deleted in our database
            const { error: deleteError } = await supabase
              .from("calendar_events")
              .update({
                sync_status: "deleted",
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", refreshedConn.user_id)
              .eq("provider", "google")
              .eq("external_event_id", event.id);

            if (!deleteError) {
              deleted++;
            }
            continue;
          }

          // Determine busy type
          const busyType = getBusyType(event);

          // Upsert calendar event
          const { error: upsertError } = await supabase
            .from("calendar_events")
            .upsert(
              {
                workspace_id: refreshedConn.workspace_id,
                user_id: refreshedConn.user_id,
                calendar_connection_id: refreshedConn.id,
                external_event_id: event.id,
                provider: "google",
                calendar_id: refreshedConn.calendar_id || "primary",
                title: event.summary || "Untitled Event",
                description: event.description || null,
                location: event.location || null,
                start_time: start,
                end_time: end,
                all_day: !event.start?.dateTime,
                status: event.status === "tentative" ? "tentative" : "confirmed",
                busy_type: busyType,
                sync_status: "synced",
                last_synced_at: new Date().toISOString(),
                auto_block_enabled: true, // Auto-block by default
                block_type: busyType === "out_of_office" ? "out_of_office" : "calendar_event",
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "user_id,provider,external_event_id",
                ignoreDuplicates: false,
              }
            );

          if (!upsertError) {
            synced++;
          } else {
            console.error(`Error upserting event ${event.id}:`, upsertError);
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
        synced,
        deleted,
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





















































