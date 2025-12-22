import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

// POST /api/suppression/check - Check if emails are suppressed (bulk check)
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, emails } = body;

    if (!workspace_id || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "workspace_id and emails array required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Normalize emails
    const normalizedEmails = emails.map((e: string) => e.toLowerCase().trim());

    // Check which emails are suppressed
    const { data: suppressions, error } = await supabase
      .from("suppression_list")
      .select("email, reason")
      .eq("workspace_id", workspace_id)
      .in("email", normalizedEmails);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build result map
    const suppressedSet = new Set(
      (suppressions || []).map((s) => s.email.toLowerCase())
    );
    const suppressedMap = new Map(
      (suppressions || []).map((s) => [s.email.toLowerCase(), s.reason])
    );

    const result = normalizedEmails.map((email) => ({
      email,
      suppressed: suppressedSet.has(email),
      reason: suppressedMap.get(email) || null,
    }));

    const suppressedCount = result.filter((r) => r.suppressed).length;

    return NextResponse.json({
      total: emails.length,
      suppressed: suppressedCount,
      results: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
