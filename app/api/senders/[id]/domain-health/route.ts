import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = params.id;

    // Fetch sender identity with user ownership check
    const { data: sender, error: senderError } = await supabase
      .from("sender_identities")
      .select("from_email, domain")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (senderError || !sender) {
      return NextResponse.json(
        { error: "Sender not found" },
        { status: 404 }
      );
    }

    // Extract domain from from_email or use domain field
    const domain = sender.domain || sender.from_email?.split("@")[1]?.toLowerCase();
    
    if (!domain) {
      return NextResponse.json(
        { error: "Could not determine domain" },
        { status: 400 }
      );
    }

    // Fetch domain health
    const { data: health, error: healthError } = await supabase
      .from("domain_health")
      .select("*")
      .eq("domain", domain.toLowerCase())
      .maybeSingle();

    if (healthError) {
      console.error("Error fetching domain health:", healthError);
      // Don't fail the request if health doesn't exist yet
    }

    return NextResponse.json({
      domain,
      health: health || null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/senders/[id]/domain-health:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



