import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domain } = await req.json();

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    // Verify domain belongs to user's workspace
    const { data: domainData, error: domainError } = await supabase
      .from("sender_domains")
      .select("id, workspace_id")
      .eq("domain", domain.toLowerCase().trim())
      .single();

    if (domainError || !domainData) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Verify user is member of workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", domainData.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Call edge function to check DNS
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/check-domain`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ domain }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error || "DNS check failed" },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error checking domain DNS:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



