// app/api/smartsend/outbound-accounts/route.ts
// Block 8160 — CRUD shell for outbound_email_accounts (create + list)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = ["gmail", "outlook", "smtp"] as const;
type Provider = (typeof PROVIDERS)[number];

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  // TODO: wire org_id properly if you have org selection
  const { data, error } = await supabase
    .from("outbound_email_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("GET outbound_email_accounts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load outbound accounts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, accounts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);

  const provider = (body?.provider ?? "").toLowerCase() as Provider;
  const fromEmail = (body?.fromEmail ?? "").trim();
  const displayName =
    typeof body?.displayName === "string" ? body.displayName.trim() : null;

  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "Invalid provider" },
      { status: 400 }
    );
  }

  if (!fromEmail) {
    return NextResponse.json(
      { ok: false, error: "From email is required" },
      { status: 400 }
    );
  }

  // TODO: get org_id from your org context
  const orgId = null;

  const { data, error } = await supabase
    .from("outbound_email_accounts")
    .insert({
      org_id: orgId,
      user_id: user.id,
      provider,
      from_email: fromEmail,
      display_name: displayName,
      status: "connected", // dev stub: treat as connected
      metadata: {
        dev_stub: true,
        note: "Replace this with real OAuth credentials later",
      },
    })
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("POST outbound_email_accounts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create outbound account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, account: data });
}

































































