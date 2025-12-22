import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { generateDKIMPair } from "@/lib/domains";

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// POST /api/settings/domain/regenerate-dkim - Regenerate DKIM keys
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check permissions
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { domain_id } = body;

    if (!domain_id) {
      return NextResponse.json({ error: "domain_id is required" }, { status: 400 });
    }

    // Generate new DKIM keys using existing utility
    const { publicTxt, privatePem } = generateDKIMPair();
    // Extract just the public key part (p=...)
    const publicKeyMatch = publicTxt.match(/p=([A-Za-z0-9+/=]+)/);
    const publicKey = publicKeyMatch ? publicKeyMatch[1] : publicTxt;

    // Update domain settings
    const { data: domain, error } = await supabase
      .from("domain_settings")
      .update({
        dkim_public_key: publicKey,
        dkim_private_key: privatePem,
        dkim_pass: false, // Reset verification status
        verification_status: "unverified",
        safe_mode: true,
      })
      .eq("id", domain_id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      domain,
      message: "DKIM keys regenerated. Please update your DNS records.",
    });
  } catch (error: any) {
    console.error("Error regenerating DKIM keys:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

