import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const lead_id = searchParams.get("lead_id");

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id query parameter required" },
        { status: 400 }
      );
    }

    // Verify user has access to the lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Check workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", lead.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch latest quote for this lead
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select("*, quote_items(*)")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (quoteErr) {
      console.error("Error fetching quote:", quoteErr);
      return NextResponse.json({ error: quoteErr.message }, { status: 500 });
    }

    return NextResponse.json(quote || null);
  } catch (error: any) {
    console.error("Unexpected error in get latest quote:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










































