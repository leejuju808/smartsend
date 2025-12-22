export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function makeToken() {
  // URL-safe, short, non-guessable enough for read-only stats links.
  return randomBytes(16).toString("base64url");
}

function baseUrl(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    req.nextUrl.origin
  );
}

/**
 * GET  /api/proof-share  -> returns current active share URL (or null)
 * POST /api/proof-share  -> create (or reuse) active share URL
 * DELETE /api/proof-share -> revoke active share URL
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row, error } = await supabaseAdmin
    .from("workspace_proof_shares")
    .select("token, revoked_at")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to load share" }, { status: 500 });

  const token = (row as any)?.token as string | undefined;
  return NextResponse.json({
    token: token ?? null,
    url: token ? `${baseUrl(req)}/proof/${token}` : null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Reuse existing active token if present.
  const { data: existing } = await supabaseAdmin
    .from("workspace_proof_shares")
    .select("token")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingToken = (existing as any)?.token as string | undefined;
  if (existingToken) {
    return NextResponse.json({
      token: existingToken,
      url: `${baseUrl(req)}/proof/${existingToken}`,
    });
  }

  // Create new token.
  const token = makeToken();
  const { error: insErr } = await supabaseAdmin.from("workspace_proof_shares").insert({
    workspace_id: workspaceId,
    token,
    created_by: user.id,
  } as any);

  if (insErr) return NextResponse.json({ error: "Failed to create share" }, { status: 500 });

  return NextResponse.json({
    token,
    url: `${baseUrl(req)}/proof/${token}`,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("workspace_proof_shares")
    .update({ revoked_at: nowIso } as any)
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null);

  if (error) return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  return NextResponse.json({ ok: true });
}








