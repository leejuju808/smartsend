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

// GET /api/settings/domain - Get domain settings for org
export async function GET(req: NextRequest) {
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

    const { data: domains, error } = await supabase
      .from("domain_settings")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ domains: domains || [] });
  } catch (error: any) {
    console.error("Error fetching domain settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/settings/domain - Create or update domain settings
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
    const { domain, sending_email, provider } = body;

    if (!domain || !sending_email) {
      return NextResponse.json(
        { error: "Domain and sending_email are required" },
        { status: 400 }
      );
    }

    // Extract domain from sending_email if needed
    const cleanDomain = domain.includes("@") 
      ? domain.split("@")[1].toLowerCase()
      : domain.toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sending_email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Generate DKIM keys using existing utility
    const { publicTxt, privatePem } = generateDKIMPair();
    // Extract just the public key part (p=...)
    const publicKeyMatch = publicTxt.match(/p=([A-Za-z0-9+/=]+)/);
    const publicKey = publicKeyMatch ? publicKeyMatch[1] : publicTxt;

    // Upsert domain settings
    const { data: domainSetting, error } = await supabase
      .from("domain_settings")
      .upsert(
        {
          org_id: orgId,
          user_id: user.id,
          domain: cleanDomain,
          sending_email: sending_email.toLowerCase(),
          provider: provider || "custom",
          dkim_selector: "smartsend",
          dkim_public_key: publicKey,
          dkim_private_key: privatePem,
          safe_mode: true, // Start in safe mode
          verification_status: "unverified",
        },
        { onConflict: "org_id,domain" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ domain: domainSetting });
  } catch (error: any) {
    console.error("Error creating domain settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/domain - Update domain settings
export async function PATCH(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const domainId = searchParams.get("id");

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const updates: any = {};

    // Allow updating specific fields
    if (body.provider !== undefined) updates.provider = body.provider;
    if (body.sending_email !== undefined) updates.sending_email = body.sending_email.toLowerCase();

    const { data: domain, error } = await supabase
      .from("domain_settings")
      .update(updates)
      .eq("id", domainId)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ domain });
  } catch (error: any) {
    console.error("Error updating domain settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/domain - Delete domain settings
export async function DELETE(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const domainId = searchParams.get("id");

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("domain_settings")
      .delete()
      .eq("id", domainId)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error deleting domain settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

