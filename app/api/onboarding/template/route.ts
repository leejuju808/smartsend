// Block 21675 — Select Template API
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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { template_id } = body;

  if (!template_id) {
    return NextResponse.json(
      { error: "template_id is required" },
      { status: 400 }
    );
  }

  // Get template details
  const { data: template, error: templateError } = await supabase
    .from("campaign_templates")
    .select("id, name, emails, goal")
    .eq("id", template_id)
    .eq("niche", "roofing")
    .eq("is_active", true)
    .single();

  if (templateError || !template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  // Store selected template in onboarding state (we'll use a JSONB column or separate table)
  // For now, we'll store it in user metadata or a separate onboarding_data table
  // This will be used in the personalize step

  return NextResponse.json({
    success: true,
    template_id: template.id,
    template_name: template.name,
  });
}














































