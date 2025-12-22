import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

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

// POST /api/settings/domain/verify - Verify domain DNS records
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

    const body = await req.json();
    const { domain_id } = body;

    if (!domain_id) {
      return NextResponse.json({ error: "domain_id is required" }, { status: 400 });
    }

    // Fetch domain settings
    const { data: domain, error: fetchError } = await supabase
      .from("domain_settings")
      .select("*")
      .eq("id", domain_id)
      .eq("org_id", orgId)
      .single();

    if (fetchError || !domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Call edge function for verification
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/domain-verify-v2`;
    
    const verifyResponse = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        domain: domain.domain,
        domain_id: domain_id,
        dkim_selector: domain.dkim_selector || "smartsend",
      }),
    });

    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.json();
      return NextResponse.json(
        { error: errorData.error || "Verification failed" },
        { status: verifyResponse.status }
      );
    }

    const verificationResult = await verifyResponse.json();

    return NextResponse.json(verificationResult);
  } catch (error: any) {
    console.error("Error verifying domain:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































