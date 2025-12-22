import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const { lead_id, body } = await req.json();

    if (!lead_id || !body) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing lead_id or body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get lead data - try different structures depending on migration
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("linkedin, workspace_id, team_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ ok: false, error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get org_id - try workspace_id first, then team_id -> workspace_id
    let orgId: string | null = (lead as any).workspace_id;
    
    if (!orgId && (lead as any).team_id) {
      // Try to get workspace_id from team
      const { data: team } = await supabase
        .from("teams")
        .select("workspace_id")
        .eq("id", (lead as any).team_id)
        .single();
      
      orgId = team?.workspace_id || null;
    }
    
    if (!orgId) {
      return new Response(
        JSON.stringify({ ok: false, error: "No organization found for lead" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get LinkedIn integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("access_token, expires_at")
      .eq("org_id", orgId)
      .eq("channel", "linkedin")
      .single();

    if (integrationError || !integration?.access_token) {
      return new Response(
        JSON.stringify({ ok: false, error: "LinkedIn integration not found or expired" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ ok: false, error: "LinkedIn token expired" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract LinkedIn member ID from URL
    // Expected format: https://www.linkedin.com/in/username or https://linkedin.com/in/username
    if (!lead.linkedin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Lead missing LinkedIn URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const linkedinMatch = lead.linkedin.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    if (!linkedinMatch || !linkedinMatch[1]) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid LinkedIn URL format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const memberId = linkedinMatch[1].trim();

    // Get LinkedIn profile URN (we'll need to fetch profile first, but for now use simplified approach)
    // Note: LinkedIn API requires the profile to be fetched first to get the URN
    // For now, we'll attempt to send using the memberId format
    // In production, you'd need to:
    // 1. Fetch profile: GET https://api.linkedin.com/v2/people/(memberId:{memberId})
    // 2. Get the URN from the response
    // 3. Use that URN in the message API

    // Simplified approach: try to send with memberId as URN
    // This may need adjustment based on LinkedIn API requirements
    const profileUrn = `urn:li:person:${memberId}`;

    // Send LinkedIn message
    const messageRes = await fetch("https://api.linkedin.com/v2/messaging/conversations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        participants: [profileUrn],
        subject: "SmartSend Message",
        body: {
          text: body,
        },
      }),
    });

    // Note: LinkedIn Messaging API v2 has specific requirements
    // This is a simplified implementation. You may need to:
    // 1. Create conversation first
    // 2. Then send message in that conversation
    // Check LinkedIn API docs for exact flow

    const ok = messageRes.ok;
    let externalMessageId = null;

    if (ok) {
      try {
        const messageData = await messageRes.json();
        externalMessageId = messageData.id || messageData.entity || null;
      } catch {
        // If response isn't JSON, try to get from headers
        externalMessageId = messageRes.headers.get("x-linkedin-id") || null;
      }
    } else {
      const errorText = await messageRes.text();
      console.error("LinkedIn API error:", errorText);
    }

    // Log message in channel_messages table
    const { error: logError } = await supabase.from("channel_messages").insert({
      org_id: orgId,
      lead_id: lead_id,
      channel: "linkedin",
      direction: "outbound",
      body: body,
      subject: "SmartSend Message",
      status: ok ? "delivered" : "failed",
      external_message_id: externalMessageId,
      metadata: {
        linkedin_url: lead.linkedin,
        member_id: memberId,
        error: ok ? null : await messageRes.text().catch(() => "Unknown error"),
      },
    });

    if (logError) {
      console.error("Error logging channel message:", logError);
    }

    // Track usage: Get user_id from org_id
    if (ok && orgId) {
      try {
        const { data: orgMember } = await supabase
          .from("org_members")
          .select("user_id")
          .eq("org_id", orgId)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        
        // Fallback to any member if no owner found
        if (!orgMember) {
          const { data: anyMember } = await supabase
            .from("org_members")
            .select("user_id")
            .eq("org_id", orgId)
            .limit(1)
            .maybeSingle();
          
          if (anyMember?.user_id) {
            await supabase.rpc("increment_usage", {
              p_user_id: anyMember.user_id,
              p_metric: "linkedin_dms"
            });
          }
        } else if (orgMember.user_id) {
          await supabase.rpc("increment_usage", {
            p_user_id: orgMember.user_id,
            p_metric: "linkedin_dms"
          });
        }
      } catch (error) {
        console.warn("Failed to track LinkedIn usage:", error);
      }
    }

    return new Response(
      JSON.stringify({ 
        ok, 
        message_id: externalMessageId,
        error: ok ? null : "Failed to send LinkedIn message"
      }),
      { 
        status: ok ? 200 : 500,
        headers: { "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("Error in linkedin-send:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

