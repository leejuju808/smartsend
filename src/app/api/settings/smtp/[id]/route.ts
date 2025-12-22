import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secret";

/**
 * PATCH /api/settings/smtp/:id  (JSON: updates; secret optional)
 * DELETE /api/settings/smtp/:id?workspaceId=uuid
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { workspaceId, ...rest } = body || {};
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

    const updates: any = {};
    const allowed = ["label","host","port","secure","username","from_name","from_email","rate_limit_per_minute"];
    for (const k of allowed) if (k in rest) updates[k] = rest[k];
    if (typeof rest.secret === "string" && rest.secret.length > 0) {
      updates.secret_ciphertext = encryptSecret(rest.secret);
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("smtp_accounts")
      .update(updates)
      .eq("workspace_id", workspaceId)
      .eq("id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update SMTP account" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase
    .from("smtp_accounts")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}