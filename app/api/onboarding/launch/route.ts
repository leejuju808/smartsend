// Block 21675 — Launch Campaign API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No workspace found" },
      { status: 400 }
    );
  }

  const workspaceId = membership.workspace_id;

  // Get user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name")
    .eq("id", user.id)
    .maybeSingle();

  // Get selected template (in a real implementation, this would be stored from the template selection step)
  // For v1, we'll use a default template
  const { data: template } = await supabase
    .from("campaign_templates")
    .select("id, name, emails, goal")
    .eq("niche", "roofing")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!template) {
    return NextResponse.json(
      { error: "No template found" },
      { status: 404 }
    );
  }

  // Get homeowners list
  const { data: homeownersList } = await supabase
    .from("contact_lists")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Homeowners List")
    .maybeSingle();

  // Create campaign
  const emails = template.emails as any[];
  const firstEmail = emails[0] || {};

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
      name: `My First Roofing Campaign`,
      subject: firstEmail.subject || "Quick question about your roof",
      body_template: firstEmail.body || "",
      status: "active",
      daily_cap: 50,
    })
    .select("id")
    .single();

  if (campaignError) {
    console.error("Error creating campaign:", campaignError);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

  // Add leads to campaign (if homeowners list exists)
  if (homeownersList) {
    const { data: contacts } = await supabase
      .from("contact_list_members")
      .select("contact_id, contacts!inner(email, first_name, last_name)")
      .eq("list_id", homeownersList.id)
      .limit(100); // Limit to first 100 for onboarding

    if (contacts && contacts.length > 0) {
      const leads = contacts.map((c: any) => ({
        campaign_id: campaign.id,
        email: c.contacts.email,
        first_name: c.contacts.first_name,
        last_name: c.contacts.last_name,
        status: "pending",
      }));

      await supabase.from("leads").insert(leads);
    }
  }

  return NextResponse.json({
    success: true,
    campaign_id: campaign.id,
  });
}
