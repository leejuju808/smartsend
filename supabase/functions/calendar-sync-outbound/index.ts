// Block 282 — Calendar Sync v1: Outbound Sync
// Syncs SmartSend meetings → Google Calendar / Outlook

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
};

type Meeting = {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  lead_id: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
  calendar_event_id: string | null;
  calendar_provider: string | null;
  calendar_status: string;
};

// Refresh Google OAuth token
async function refreshGoogleToken(conn: CalendarConnection): Promise<CalendarConnection> {
  if (!conn.refresh_token) {
    throw new Error("No refresh token available");
  }

  // Check if token is still valid (3 min buffer)
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

  // Update token in database
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

  // Check if token is still valid (3 min buffer)
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

  // Update token in database
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

// Create Google Calendar event
async function createGoogleEvent(
  conn: CalendarConnection,
  meeting: Meeting,
  leadEmail: string | null,
  appUrl: string
): Promise<string> {
  const calendarId = conn.calendar_id || "primary";
  const eventTitle = meeting.title || "Meeting";
  const description = [
    `SmartSend Meeting: ${meeting.id}`,
    meeting.lead_id ? `Lead: ${appUrl}/leads/${meeting.lead_id}` : "",
    meeting.thread_id ? `Thread: ${appUrl}/inbox/${meeting.thread_id}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const event = {
    summary: eventTitle,
    description: description,
    start: {
      dateTime: meeting.start_time!,
      timeZone: meeting.timezone || "UTC",
    },
    end: {
      dateTime: meeting.end_time!,
      timeZone: meeting.timezone || "UTC",
    },
    attendees: leadEmail ? [{ email: leadEmail }] : [],
  };

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create Google event: ${error}`);
  }

  const data = await res.json();
  return data.id;
}

// Update Google Calendar event
async function updateGoogleEvent(
  conn: CalendarConnection,
  eventId: string,
  meeting: Meeting,
  leadEmail: string | null,
  appUrl: string
): Promise<void> {
  const calendarId = conn.calendar_id || "primary";
  const eventTitle = meeting.title || "Meeting";
  const description = [
    `SmartSend Meeting: ${meeting.id}`,
    meeting.lead_id ? `Lead: ${appUrl}/leads/${meeting.lead_id}` : "",
    meeting.thread_id ? `Thread: ${appUrl}/inbox/${meeting.thread_id}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const event = {
    summary: eventTitle,
    description: description,
    start: {
      dateTime: meeting.start_time!,
      timeZone: meeting.timezone || "UTC",
    },
    end: {
      dateTime: meeting.end_time!,
      timeZone: meeting.timezone || "UTC",
    },
    attendees: leadEmail ? [{ email: leadEmail }] : [],
  };

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update Google event: ${error}`);
  }
}

// Delete Google Calendar event
async function deleteGoogleEvent(conn: CalendarConnection, eventId: string): Promise<void> {
  const calendarId = conn.calendar_id || "primary";
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const error = await res.text();
    throw new Error(`Failed to delete Google event: ${error}`);
  }
}

// Create Outlook Calendar event
async function createOutlookEvent(
  conn: CalendarConnection,
  meeting: Meeting,
  leadEmail: string | null,
  appUrl: string
): Promise<string> {
  const eventTitle = meeting.title || "Meeting";
  const body = {
    contentType: "HTML",
    content: [
      `<p>SmartSend Meeting: ${meeting.id}</p>`,
      meeting.lead_id ? `<p><a href="${appUrl}/leads/${meeting.lead_id}">View Lead</a></p>` : "",
      meeting.thread_id ? `<p><a href="${appUrl}/inbox/${meeting.thread_id}">View Thread</a></p>` : "",
    ]
      .filter(Boolean)
      .join(""),
  };

  const event = {
    subject: eventTitle,
    body: body,
    start: {
      dateTime: meeting.start_time!,
      timeZone: meeting.timezone || "UTC",
    },
    end: {
      dateTime: meeting.end_time!,
      timeZone: meeting.timezone || "UTC",
    },
    attendees: leadEmail ? [{ emailAddress: { address: leadEmail } }] : [],
  };

  const url = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(conn.calendar_id)}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create Outlook event: ${error}`);
  }

  const data = await res.json();
  return data.id;
}

// Update Outlook Calendar event
async function updateOutlookEvent(
  conn: CalendarConnection,
  eventId: string,
  meeting: Meeting,
  leadEmail: string | null,
  appUrl: string
): Promise<void> {
  const eventTitle = meeting.title || "Meeting";
  const body = {
    contentType: "HTML",
    content: [
      `<p>SmartSend Meeting: ${meeting.id}</p>`,
      meeting.lead_id ? `<p><a href="${appUrl}/leads/${meeting.lead_id}">View Lead</a></p>` : "",
      meeting.thread_id ? `<p><a href="${appUrl}/inbox/${meeting.thread_id}">View Thread</a></p>` : "",
    ]
      .filter(Boolean)
      .join(""),
  };

  const event = {
    subject: eventTitle,
    body: body,
    start: {
      dateTime: meeting.start_time!,
      timeZone: meeting.timezone || "UTC",
    },
    end: {
      dateTime: meeting.end_time!,
      timeZone: meeting.timezone || "UTC",
    },
    attendees: leadEmail ? [{ emailAddress: { address: leadEmail } }] : [],
  };

  const url = `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update Outlook event: ${error}`);
  }
}

// Delete Outlook Calendar event
async function deleteOutlookEvent(conn: CalendarConnection, eventId: string): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const error = await res.text();
    throw new Error(`Failed to delete Outlook event: ${error}`);
  }
}

// Main handler
Deno.serve(async (req) => {
  try {
    const { meeting_id, action } = await req.json();

    if (!meeting_id) {
      return new Response(
        JSON.stringify({ error: "meeting_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: "Meeting not found", details: meetingError }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const m = meeting as Meeting;

    // Check if meeting should be synced
    if (!m.owner_id || !m.start_time || m.calendar_status === "disabled") {
      return new Response(
        JSON.stringify({ error: "Meeting cannot be synced: missing owner or start_time, or disabled" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user's calendar connection
    const { data: connections, error: connError } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("user_id", m.owner_id)
      .eq("is_active", true)
      .limit(1);

    if (connError || !connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active calendar connection found for user" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    let conn = connections[0] as CalendarConnection;

    // Refresh token if needed
    if (conn.provider === "google") {
      conn = await refreshGoogleToken(conn);
    } else if (conn.provider === "outlook") {
      conn = await refreshOutlookToken(conn);
    }

    // Get lead email for attendee
    let leadEmail: string | null = null;
    if (m.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("email")
        .eq("id", m.lead_id)
        .single();
      leadEmail = lead?.email || null;
    }

    const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://app.smartsend.ai";

    // Handle action
    if (action === "delete" || action === "cancel") {
      // Delete event from calendar
      if (m.calendar_event_id && m.calendar_provider) {
        try {
          if (m.calendar_provider === "google") {
            await deleteGoogleEvent(conn, m.calendar_event_id);
          } else if (m.calendar_provider === "outlook") {
            await deleteOutlookEvent(conn, m.calendar_event_id);
          }

          // Update meeting status
          await supabase
            .from("meetings")
            .update({
              calendar_status: "cancelled",
              calendar_event_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", meeting_id);

          return new Response(
            JSON.stringify({ success: true, action: "deleted" }),
            { headers: { "Content-Type": "application/json" } }
          );
        } catch (error) {
          // Update status to failed
          await supabase
            .from("meetings")
            .update({
              calendar_status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", meeting_id);

          return new Response(
            JSON.stringify({ error: "Failed to delete calendar event", details: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    } else {
      // Create or update event
      try {
        let eventId: string;

        if (m.calendar_event_id && m.calendar_provider === conn.provider) {
          // Update existing event
          if (conn.provider === "google") {
            await updateGoogleEvent(conn, m.calendar_event_id, m, leadEmail, appUrl);
            eventId = m.calendar_event_id;
          } else {
            await updateOutlookEvent(conn, m.calendar_event_id, m, leadEmail, appUrl);
            eventId = m.calendar_event_id;
          }
        } else {
          // Create new event
          if (conn.provider === "google") {
            eventId = await createGoogleEvent(conn, m, leadEmail, appUrl);
          } else {
            eventId = await createOutlookEvent(conn, m, leadEmail, appUrl);
          }
        }

        // Update meeting with calendar event info
        await supabase
          .from("meetings")
          .update({
            calendar_event_id: eventId,
            calendar_provider: conn.provider,
            calendar_status: "synced",
            updated_at: new Date().toISOString(),
          })
          .eq("id", meeting_id);

        // Log activity
        if (m.lead_id) {
          await supabase.from("lead_activity").insert({
            workspace_id: m.workspace_id,
            lead_id: m.lead_id,
            type: "meeting_scheduled",
            title: "Meeting synced to calendar",
            body: `Meeting "${m.title}" synced to ${conn.provider} calendar`,
            metadata: { meeting_id: meeting_id, calendar_provider: conn.provider, calendar_event_id: eventId },
            occurred_at: new Date().toISOString(),
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            action: m.calendar_event_id ? "updated" : "created",
            calendar_event_id: eventId,
            calendar_provider: conn.provider,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        // Update status to failed
        await supabase
          .from("meetings")
          .update({
            calendar_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", meeting_id);

        return new Response(
          JSON.stringify({ error: "Failed to sync calendar event", details: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});








