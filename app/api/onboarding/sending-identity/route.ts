// app/api/onboarding/sending-identity/route.ts
// Block 9200 — Onboarding Flow v1: Step 2 — Sending Identity
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Helper to check if domain is a free email provider
function isFreeEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  const freeDomains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "aol.com",
    "icloud.com",
    "mail.com",
    "protonmail.com",
    "yandex.com",
    "zoho.com",
  ];
  return freeDomains.includes(domain || "");
}

// Helper to validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { from_name, from_email, reply_to_email } = body;

  // Validate required fields
  if (!from_name || !from_email) {
    return NextResponse.json(
      { error: "Missing required fields: from_name, from_email" },
      { status: 400 }
    );
  }

  // Validate email format
  if (!isValidEmail(from_email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  if (reply_to_email && !isValidEmail(reply_to_email)) {
    return NextResponse.json(
      { error: "Invalid reply_to_email format" },
      { status: 400 }
    );
  }

  // Check domain status
  const isFreeDomain = isFreeEmailDomain(from_email);
  const domain = from_email.split("@")[1];

  // For V1, verified is true once they confirm via onboarding
  // (we'll add real DNS verification later)
  const verified = true;

  // First, unset any existing default identities
  await supabase
    .from("sending_identities")
    .update({ is_default: false })
    .eq("workspace_id", workspaceId)
    .eq("is_default", true);

  // Check if identity already exists
  const { data: existingIdentity } = await supabase
    .from("sending_identities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("from_email", from_email.toLowerCase())
    .maybeSingle();

  let identity;
  if (existingIdentity) {
    // Update existing
    const { data: updated, error: updateError } = await supabase
      .from("sending_identities")
      .update({
        from_name,
        reply_to_email: reply_to_email ? reply_to_email.toLowerCase() : null,
        is_default: true,
        verified,
      })
      .eq("id", existingIdentity.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating sending identity:", updateError);
      return NextResponse.json(
        { error: "Failed to update sending identity" },
        { status: 500 }
      );
    }
    identity = updated;
  } else {
    // Insert new
    const { data: inserted, error: insertError } = await supabase
      .from("sending_identities")
      .insert({
        workspace_id: workspaceId,
        from_name,
        from_email: from_email.toLowerCase(),
        reply_to_email: reply_to_email ? reply_to_email.toLowerCase() : null,
        is_default: true,
        verified,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating sending identity:", insertError);
      return NextResponse.json(
        { error: "Failed to create sending identity" },
        { status: 500 }
      );
    }
    identity = inserted;
  }

  if (identityError) {
    console.error("Error saving sending identity:", identityError);
    return NextResponse.json(
      { error: "Failed to save sending identity" },
      { status: 500 }
    );
  }

  // Update workspace onboarding step
  const { error: stepError } = await supabase
    .from("workspaces")
    .update({ onboarding_step: "import_leads" })
    .eq("id", workspaceId);

  if (stepError) {
    console.error("Error updating onboarding step:", stepError);
  }

  return NextResponse.json(
    {
      success: true,
      identity,
      domain_status: {
        domain,
        is_free_domain: isFreeDomain,
        warning: isFreeDomain
          ? "We recommend using a business domain for better deliverability."
          : null,
      },
    },
    { status: 200 }
  );
}

