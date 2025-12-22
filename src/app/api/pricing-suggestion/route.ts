import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org_id from profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get the latest pricing action for this org
    const { data: pricingAction, error } = await supabaseAdmin
      .from("pricing_actions")
      .select("*")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching pricing action:", error);
      return NextResponse.json({ error: "Failed to fetch pricing suggestion" }, { status: 500 });
    }

    return NextResponse.json({
      suggestion: pricingAction || null,
      org_id: profile.org_id,
    });
  } catch (error) {
    console.error("Error in pricing-suggestion API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

