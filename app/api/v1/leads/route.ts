// POST /v1/leads - Create lead(s)
// GET /v1/leads - List leads with filters

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// POST /v1/leads
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { leads } = body;

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    throw new ApiError("400_INVALID_BODY", "leads array is required");
  }

  const created: any[] = [];
  const suppressed: any[] = [];
  const errors: any[] = [];

  for (const lead of leads) {
    const { email, first_name, last_name, company, custom, phone, title } = lead;

    if (!email) {
      errors.push({ email: email || null, error: "email is required" });
      continue;
    }

    // Check if email is suppressed
    const { data: suppressedEmail } = await supabase
      .from("suppressions")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("workspace_id", auth.workspaceId)
      .single();

    if (suppressedEmail) {
      suppressed.push({ email, reason: "suppressed" });
      continue;
    }

    // Check if lead already exists
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("workspace_id", auth.workspaceId)
      .single();

    if (existing) {
      suppressed.push({ email, reason: "duplicate" });
      continue;
    }

    // Create lead
    const { data: newLead, error } = await supabase
      .from("leads")
      .insert({
        email: email.toLowerCase(),
        first_name: first_name || null,
        last_name: last_name || null,
        company: company || null,
        phone: phone || null,
        title: title || null,
        custom: custom || {},
        workspace_id: auth.workspaceId,
        status: "new",
      })
      .select()
      .single();

    if (error) {
      errors.push({ email, error: error.message });
    } else {
      created.push(newLead);
      
      // Block 93000: Auto-attribute lead if source/campaign info provided
      if (newLead.id && (lead.source || lead.campaign_id || lead.qr_code_id || lead.referrer)) {
        try {
          const { autoAttributeLead, attributeFromQRCode, attributeFromWebsiteForm } = await import("@/lib/attribution/attribution-helpers");
          
          if (lead.qr_code_id) {
            await attributeFromQRCode(supabase, auth.workspaceId, newLead.id, lead.qr_code_id);
          } else if (lead.referrer || lead.landing_page) {
            await attributeFromWebsiteForm(
              supabase,
              auth.workspaceId,
              newLead.id,
              lead.landing_page,
              lead.referrer,
              lead.utm_params
            );
          } else {
            // Generic attribution
            await autoAttributeLead(supabase, auth.workspaceId, newLead.id, {
              source_id: lead.source_id || null,
              campaign_id: lead.campaign_id || null,
              offer: lead.offer || null,
              landing_page: lead.landing_page || null,
              referrer: lead.referrer || null,
              utm_source: lead.utm_params?.utm_source || null,
              utm_medium: lead.utm_params?.utm_medium || null,
              utm_campaign: lead.utm_params?.utm_campaign || null,
              utm_term: lead.utm_params?.utm_term || null,
              utm_content: lead.utm_params?.utm_content || null,
            });
          }
        } catch (attrError) {
          console.warn("Failed to attribute lead:", attrError);
          // Don't fail lead creation if attribution fails
        }
      }
      
      // Trigger webhook
      triggerWebhooks(auth.workspaceId, "lead.created", {
        lead: newLead,
      }).catch(console.error);
    }
  }

  return NextResponse.json({
    created,
    suppressed,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// GET /v1/leads
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchParams = req.nextUrl.searchParams;
  const email = searchParams.get("email");
  const company = searchParams.get("company");
  const intent = searchParams.get("intent");
  const ownerId = searchParams.get("owner_id");
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const limitClamped = Math.min(Math.max(limit, 1), 100);

  let query = supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .limit(limitClamped);

  if (email) {
    query = query.eq("email", email.toLowerCase());
  }

  if (company) {
    query = query.ilike("company", `%${company}%`);
  }

  if (intent) {
    query = query.eq("intent", intent);
  }

  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: leads, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  const nextCursor =
    leads && leads.length === limitClamped
      ? leads[leads.length - 1].created_at
      : null;

  return NextResponse.json({
    data: leads || [],
    pagination: {
      cursor: nextCursor,
      limit: limitClamped,
      has_more: nextCursor !== null,
    },
  });
});
