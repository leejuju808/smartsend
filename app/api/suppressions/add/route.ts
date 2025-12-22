import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { workspaceId, email, reason } = await req.json();

    if (!workspaceId || !email) {
      return NextResponse.json(
        { error: "workspaceId and email required" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("email_suppressions").upsert(
      {
        workspace_id: workspaceId,
        email: email.toLowerCase(),
        reason: reason || "manual",
        source: "user",
      },
      { onConflict: "workspace_id,email" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







