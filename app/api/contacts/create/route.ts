// app/api/contacts/create/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      email?: string;
      firstName?: string | null;
      lastName?: string | null;
      city?: string | null;
      state?: string | null;
    };

    if (!body.email || !body.email.trim()) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // get workspace
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: wsRows, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1);

    if (wsError || !wsRows || wsRows.length === 0) {
      console.error("No workspace for user:", wsError);
      return NextResponse.json(
        { error: "No workspace found for this user" },
        { status: 400 }
      );
    }

    const workspaceId = wsRows[0].workspace_id as string;

    const { error } = await supabase.from("contacts").upsert(
      {
        workspace_id: workspaceId,
        email: body.email.trim().toLowerCase(),
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        source: "manual",
      },
      {
        onConflict: "workspace_id,email",
      }
    );

    if (error) {
      console.error("Error upserting contact:", error);
      return NextResponse.json(
        { error: "Failed to save contact", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/contacts/create error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

