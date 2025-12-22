import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { email, domain } = await req.json();

  if (!email && !domain) {
    return NextResponse.json(
      { error: "Provide email or domain" },
      { status: 400 }
    );
  }

  const payload: any = {
    user_id: user.id,
    email: email ? email.toLowerCase() : null,
    domain: domain ? domain.toLowerCase() : null,
    reason: "manual",
    source: "manual",
  };

  const { data, error } = await supabase
    .from("smartsend_suppressions")
    .upsert(payload, {
      onConflict: payload.email ? "user_id,email" : "user_id,domain",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ row: data }, { status: 200 });
}
