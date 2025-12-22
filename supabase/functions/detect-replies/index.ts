// SmartSend — Autonomous Reply Detection Edge Function
// Polls Gmail inbox and detects replies from leads → updates email_logs automatically

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.21.0/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Refresh Google OAuth token
async function refreshToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

// Get all active Gmail connections
async function getGmailConnections() {
  // Try multiple connection tables based on your schema
  const queries = [
    supabase.from("user_connections").select("*").eq("provider", "gmail"),
    supabase.from("connected_accounts").select("*").eq("provider", "gmail"),
    supabase.from("email_accounts").select("*").eq("provider", "gmail"),
  ];

  for (const query of queries) {
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data;
    }
  }

  return [];
}

serve(async (req) => {
  try {
    // Check if this is a webhook call or scheduled run
    const url = new URL(req.url);
    const isWebhook = url.searchParams.get("webhook") === "true";
    
    let processedCount = 0;

    // Get all Gmail connections
    const connections = await getGmailConnections();

    if (connections.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No Gmail connections found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch all leads with emails for matching
    const { data: allLeads } = await supabase
      .from("leads")
      .select("id, email");

    const leadsMap = new Map();
    for (const lead of allLeads || []) {
      if (lead.email) {
        leadsMap.set(lead.email.toLowerCase().trim(), lead);
      }
    }

    // Process each Gmail connection
    for (const conn of connections) {
      try {
        const refresh_token = conn.refresh_token;
        if (!refresh_token) continue;

        // Get or refresh access token
        let access_token = conn.access_token;
        const expires_at = conn.expires_at || conn.token_expiry || null;

        if (!access_token || !expires_at || new Date(expires_at) < new Date(Date.now() + 60_000)) {
          const tokens = await refreshToken(refresh_token);
          access_token = tokens.access_token;

          // Update token in database
          await supabase
            .from("user_connections")
            .update({
              access_token: tokens.access_token,
              expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", conn.id)
            .catch(() => {
              // Try other tables if user_connections doesn't exist
            });
        }

        // Query inbox for recent messages (last 24 hours)
        const query = `in:inbox after:${Math.floor((Date.now() - 86400000) / 1000)} -category:promotions -category:social`;
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
          {
            headers: { Authorization: `Bearer ${access_token}` },
          }
        );

        if (!listRes.ok) {
          console.error(`Failed to list messages for connection ${conn.id}:`, await listRes.text());
          continue;
        }

        const list = await listRes.json();

        if (!list.messages || list.messages.length === 0) {
          continue;
        }

        // Process each message
        for (const msg of list.messages) {
          try {
            // Get full message
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=In-Reply-To&metadataHeaders=References`,
              {
                headers: { Authorization: `Bearer ${access_token}` },
              }
            );

            if (!msgRes.ok) continue;

            const full = await msgRes.json();
            const snippet = full.snippet || "";

            // Parse headers
            const headers: Record<string, string> = {};
            for (const h of full.payload?.headers || []) {
              if (h.name && h.value) {
                headers[h.name.toLowerCase()] = h.value;
              }
            }

            const from = headers["from"] || "";
            const subject = headers["subject"] || "";

            // Extract email from "From" header
            const match = from.match(/<([^>]+)>/);
            const fromEmail = (match?.[1] || from).trim().toLowerCase();

            // Find matching lead
            const matchedLead = leadsMap.get(fromEmail);

            if (matchedLead) {
              // Find email_logs entries for this lead that haven't been marked as replied
              const { data: emailLogs } = await supabase
                .from("email_logs")
                .select("id, campaign_id, user_id")
                .eq("lead_id", matchedLead.id)
                .eq("reply_detected", false);

              if (emailLogs && emailLogs.length > 0) {
                // Mark all matching email_logs as replied
                const logIds = emailLogs.map((log: any) => log.id);
                const { error: updateError } = await supabase
                  .from("email_logs")
                  .update({
                    reply_detected: true,
                    replied_at: new Date().toISOString(),
                  })
                  .in("id", logIds);

                if (updateError) {
                  console.error("Failed to update email_logs:", updateError);
                } else {
                  processedCount += emailLogs.length;
                  console.log(`Detected reply from ${fromEmail}, updated ${emailLogs.length} email_logs`);
                }
              }

              // Optional: Update campaign_leads if table exists
              const { data: campaignLeads } = await supabase
                .from("campaign_leads")
                .select("*")
                .eq("lead_id", matchedLead.id)
                .eq("has_replied", false)
                .maybe();

              if (campaignLeads && campaignLeads.length > 0) {
                for (const cl of campaignLeads) {
                  await supabase
                    .from("campaign_leads")
                    .update({
                      has_replied: true,
                      replied_at: new Date().toISOString(),
                      auto_detected: true,
                      reply_state: 'confirmed',
                    })
                    .eq("id", cl.id);
                }
              }
            }

            // Mark message as read in Gmail (optional)
            if (!isWebhook) {
              await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${access_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
              }).catch(() => {
                // Ignore errors marking as read
              });
            }
          } catch (msgErr: any) {
            console.error(`Error processing message ${msg.id}:`, msgErr?.message);
          }
        }
      } catch (connErr: any) {
        console.error(`Error processing connection ${conn.id}:`, connErr?.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: processedCount }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("detect-replies error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

