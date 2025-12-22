// app/api/settings/sending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("workspace_sending_settings")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (error || !data) {
    // No settings yet is fine
    return NextResponse.json(
      {
        from_name: "",
        from_email: "",
        reply_to_email: "",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      from_name: data.from_name,
      from_email: data.from_email,
      reply_to_email: data.reply_to_email,
    },
    { status: 200 }
  );
}

export async function PUT(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: {
    from_name?: string;
    from_email?: string;
    reply_to_email?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const from_name = (body.from_name ?? "").trim();
  const from_email = (body.from_email ?? "").trim();
  const reply_to_email = body.reply_to_email
    ? body.reply_to_email.trim()
    : null;

  if (!from_name || !from_email || !from_email.includes("@")) {
    return NextResponse.json(
      { error: "Valid From name and From email are required" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("workspace_sending_settings")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  const upsertPayload = {
    owner_id: user.id,
    from_name,
    from_email,
    reply_to_email,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("workspace_sending_settings")
      .update(upsertPayload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating sending settings:", error);
      return NextResponse.json(
        { error: "Failed to save settings" },
        { status: 500 }
      );
    }
    result = data;
  } else {
    const { data, error } = await supabase
      .from("workspace_sending_settings")
      .insert(upsertPayload)
      .select("*")
      .single();

    if (error) {
      console.error("Error inserting sending settings:", error);
      return NextResponse.json(
        { error: "Failed to save settings" },
        { status: 500 }
      );
    }
    result = data;
  }

  return NextResponse.json(
    {
      from_name: result.from_name,
      from_email: result.from_email,
      reply_to_email: result.reply_to_email,
    },
    { status: 200 }
  );
}

























































