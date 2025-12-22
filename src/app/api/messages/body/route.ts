import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_PROVIDERS = new Set(["gmail", "outlook"]);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  const provider = url.searchParams.get("provider");
  const messageId = url.searchParams.get("mid");

  if (!accountId || !provider || !messageId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("message_bodies")
    .select("clean_text, body_html, cleaned_at, fetched_at")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ body: data ?? null });
}


