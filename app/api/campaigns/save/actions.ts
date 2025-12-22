"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { checkPermission, getCurrentUserRole } from "@/src/lib/permissions/block12900";

const campaignSchema = z.object({
  id: z.string().uuid().optional(),        // existing for update, missing for create
  account_id: z.string().uuid(),
  name: z.string().min(1),
  from_name: z.string().min(1),
  from_email: z.string().email(),
  subject: z.string().min(1),
  body_html: z.string().min(1),
  status: z.enum(["draft", "scheduled", "launched", "paused", "completed"]).optional(),
  segment_id: z.string().uuid().nullable().optional(), // NEW
  sending_account_id: z.string().uuid().nullable().optional(), // Block 9900
  provider: z.string().nullable().optional(), // Block 8170
  provider_account_id: z.string().uuid().nullable().optional(), // Block 8170
});

export type SaveCampaignInput = z.infer<typeof campaignSchema>;

export async function saveCampaign(input: SaveCampaignInput) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Get current org
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.current_org_id) {
    throw new Error("No organization found");
  }

  const payload = campaignSchema.parse(input);

  // Block 12900: Check permissions
  if (payload.id) {
    // Update existing campaign - requires campaign.edit permission
    const canEdit = await checkPermission(
      profile.current_org_id,
      user.id,
      "campaign.edit"
    );
    if (!canEdit) {
      throw new Error("insufficient_permissions: You don't have permission to edit campaigns. Ask your manager or owner.");
    }
  } else {
    // Create new campaign - requires campaign.create permission
    const canCreate = await checkPermission(
      profile.current_org_id,
      user.id,
      "campaign.create"
    );
    if (!canCreate) {
      throw new Error("insufficient_permissions: You don't have permission to create campaigns. Ask your manager or owner.");
    }
  }

  // BLOCK 130: Validate segment exists and belongs to account
  if (payload.segment_id) {
    const { data: segment, error: segError } = await supabase
      .from("segments")
      .select("id, account_id, is_active")
      .eq("id", payload.segment_id)
      .eq("account_id", payload.account_id)
      .single();

    if (segError || !segment) {
      throw new Error(`Segment not found or does not belong to this account`);
    }

    if (!segment.is_active) {
      throw new Error(`Segment is inactive. Please activate the segment or choose a different one.`);
    }
  }

  if (payload.id) {
    // Update existing
    const { id, ...rest } = payload;

    const { data, error } = await supabase
      .from("campaigns")
      .update(rest)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  } else {
    // Create new
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        account_id: payload.account_id,
        name: payload.name,
        from_name: payload.from_name,
        from_email: payload.from_email,
        subject: payload.subject,
        body_html: payload.body_html,
        status: payload.status ?? "draft",
        segment_id: payload.segment_id ?? null, // NEW
        sending_account_id: payload.sending_account_id ?? null, // Block 9900
        provider: payload.provider ?? null, // Block 8170
        provider_account_id: payload.provider_account_id ?? null, // Block 8170
      })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }
}



