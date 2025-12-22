import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") || "gmail";
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ conn: null });

  const { data } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, email_address, token_expires_at")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ conn: null });
  }

  return NextResponse.json({
    conn: {
      id: data.id,
      provider: data.provider,
      email_address: data.email ?? data.email_address ?? null,
      token_expires_at: data.token_expires_at,
    },
  });
}

