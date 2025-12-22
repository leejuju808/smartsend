import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secret";

/**
 * GET /api/settings/smtp?workspaceId=uuid
 * POST /api/settings/smtp  (JSON: { workspaceId, label, host, port, secure, username, secret, from_name, from_email, rate_limit_per_minute })
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("smtp_accounts")
    .select("id, label, host, port, secure, username, from_name, from_email, rate_limit_per_minute, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, label, host, port, secure, username, secret, from_name, from_email, rate_limit_per_minute = 60 } = body || {};
    if (!workspaceId || !label || !host || !port || typeof secure !== "boolean" || !username || !secret || !from_email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const supabase = createClient();
    const { error } = await supabase.from("smtp_accounts").insert({
      workspace_id: workspaceId,
      label,
      host,
      port,
      secure,
      username,
      secret_ciphertext: encryptSecret(secret),
      from_name,
      from_email,
      rate_limit_per_minute
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create SMTP account" }, { status: 500 });
  }
}