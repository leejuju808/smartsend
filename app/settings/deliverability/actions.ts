"use server";

import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { cookies } from "next/headers";

const Schema = z.object({
  domain: z.string().min(1),
  teamId: z.string().uuid(),
});

export async function verifyDomain(_: any, formData: FormData) {
  const input = Schema.parse({
    domain: formData.get("domain"),
    teamId: formData.get("teamId"),
  });

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Verify user has access to this team
  const { data: membership } = await sb
    .from("team_members")
    .select("role")
    .eq("team_id", input.teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    throw new Error("Unauthorized: Not a member of this team");
  }

  // Call edge function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const functionUrl = supabaseUrl.replace(/\.supabase\.co/, ".functions.supabase.co");
  
  const res = await fetch(`${functionUrl}/domain-verify`, {
    method: "POST",
    headers: {
      "x-ss-secret": process.env.DOMAIN_SECRET!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domain: input.domain.toLowerCase(),
      team_id: input.teamId,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Verification failed: ${errorText}`);
  }

  return await res.json();
}

const LogComplaintSchema = z.object({
  senderId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  source: z.string().optional(),
  reason: z.string().optional(),
});

export async function logComplaint(_: any, formData: FormData) {
  const input = LogComplaintSchema.parse({
    senderId: formData.get("senderId"),
    campaignId: formData.get("campaignId") || undefined,
    leadId: formData.get("leadId") || undefined,
    source: formData.get("source") || undefined,
    reason: formData.get("reason") || undefined,
  });

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Verify user has access to this sender profile
  const { data: sender } = await sb
    .from("sender_profiles")
    .select("id, team_id")
    .eq("id", input.senderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sender) {
    throw new Error("Unauthorized: Sender profile not found");
  }

  // Insert complaint
  const { data: complaint, error } = await sb
    .from("complaint_logs")
    .insert({
      sender_id: input.senderId,
      campaign_id: input.campaignId || null,
      lead_id: input.leadId || null,
      source: input.source || null,
      reason: input.reason || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to log complaint: ${error.message}`);
  }

  // Auto-suppress the email if we have lead_id
  if (input.leadId) {
    const { data: lead } = await sb
      .from("campaign_leads")
      .select("email, campaign_id")
      .eq("id", input.leadId)
      .maybeSingle();
    
    if (lead?.email) {
      // Get user_id from campaign
      const { data: campaign } = await sb
        .from("campaigns")
        .select("user_id")
        .eq("id", lead.campaign_id || input.campaignId)
        .maybeSingle();
      
      if (campaign?.user_id) {
        const { suppressEmail } = await import("@/lib/hygiene/suppression");
        await suppressEmail(campaign.user_id, lead.email, "complaint", input.source || "manual");
      }
    }
  }

  // Update sender health score (decrease by 10, but not below 0)
  await sb.rpc('decrement_sender_health', {
    sender_id: input.senderId,
    decrement: 10,
  });

  return { success: true, complaint };
}

