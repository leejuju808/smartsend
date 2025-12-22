import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lead_id, channel, body, org_id, metadata } = await req.json();

  // Validate required fields
  if (!lead_id || !channel || !body) {
    return NextResponse.json(
      { error: "Missing required fields: lead_id, channel, body" },
      { status: 400 }
    );
  }

  // Validate channel
  const validChannels = ['email', 'linkedin', 'whatsapp', 'sms'];
  if (!validChannels.includes(channel)) {
    return NextResponse.json(
      { error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` },
      { status: 400 }
    );
  }

  // Get org_id from lead if not provided
  let finalOrgId = org_id;
  if (!finalOrgId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("org_id")
      .eq("id", lead_id)
      .single();
    
    if (!lead?.org_id) {
      return NextResponse.json({ error: "Lead not found or missing org_id" }, { status: 404 });
    }
    finalOrgId = lead.org_id;
  }

  // Verify user has access to this org (check both table naming conventions)
  const [membershipResult, orgMembershipOldResult, orgOwnerResult, orgOwnerOldResult] = await Promise.all([
    supabase.from("organization_members").select("org_id").eq("org_id", finalOrgId).eq("user_id", user.id).maybeSingle(),
    supabase.from("org_members").select("org_id").eq("org_id", finalOrgId).eq("user_id", user.id).maybeSingle(),
    supabase.from("organizations").select("id").eq("id", finalOrgId).eq("owner_id", user.id).maybeSingle(),
    supabase.from("orgs").select("id").eq("id", finalOrgId).eq("owner_id", user.id).maybeSingle(),
  ]);
  
  const hasAccess = !!(membershipResult.data || orgMembershipOldResult.data || orgOwnerResult.data || orgOwnerOldResult.data);
  
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden: No access to this org" }, { status: 403 });
  }

  // Save message record
  const { data: message, error: insertError } = await supabase
    .from("channel_messages")
    .insert({
      org_id: finalOrgId,
      lead_id,
      channel,
      direction: "outbound",
      body,
      metadata: metadata || {},
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Route to correct channel engine via Supabase Edge Functions
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  let channelResponse;
  
  try {
    if (channel === "email") {
      // Use existing email-send edge function or create one
      const response = await fetch(`${supabaseUrl}/functions/v1/email-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
        },
        body: JSON.stringify({ lead_id, body, message_id: message.id }),
      });
      channelResponse = await response.json();
      
      // Update status based on response
      if (response.ok && channelResponse.ok) {
        await supabase
          .from("channel_messages")
          .update({ status: "sent" })
          .eq("id", message.id);
      } else {
        await supabase
          .from("channel_messages")
          .update({ status: "failed", metadata: { error: channelResponse.error } })
          .eq("id", message.id);
      }
    } else if (channel === "linkedin") {
      const response = await fetch(`${supabaseUrl}/functions/v1/linkedin-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
        },
        body: JSON.stringify({ lead_id, body, message_id: message.id }),
      });
      channelResponse = await response.json();
      
      if (response.ok && channelResponse.ok) {
        await supabase
          .from("channel_messages")
          .update({ status: "sent" })
          .eq("id", message.id);
      } else {
        await supabase
          .from("channel_messages")
          .update({ status: "failed", metadata: { error: channelResponse.error } })
          .eq("id", message.id);
      }
    } else if (channel === "whatsapp") {
      const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
        },
        body: JSON.stringify({ lead_id, body, message_id: message.id }),
      });
      channelResponse = await response.json();
      
      if (response.ok && channelResponse.ok) {
        await supabase
          .from("channel_messages")
          .update({ status: "sent" })
          .eq("id", message.id);
      } else {
        await supabase
          .from("channel_messages")
          .update({ status: "failed", metadata: { error: channelResponse.error } })
          .eq("id", message.id);
      }
    } else if (channel === "sms") {
      // SMS sending logic (Twilio or similar)
      const response = await fetch(`${supabaseUrl}/functions/v1/sms-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(serviceRoleKey ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
        },
        body: JSON.stringify({ lead_id, body, message_id: message.id }),
      });
      channelResponse = await response.json();
      
      if (response.ok && channelResponse.ok) {
        await supabase
          .from("channel_messages")
          .update({ status: "sent" })
          .eq("id", message.id);
      } else {
        await supabase
          .from("channel_messages")
          .update({ status: "failed", metadata: { error: channelResponse.error } })
          .eq("id", message.id);
      }
    }
  } catch (error: any) {
    // Update status to failed if channel engine call fails
    await supabase
      .from("channel_messages")
      .update({ status: "failed", metadata: { error: error.message } })
      .eq("id", message.id);
    
    return NextResponse.json(
      { error: `Failed to send via ${channel}: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    messageId: message.id,
    channel,
    status: "sent",
  });
}

