import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json().catch(() => ({}));
  if (!['paused', 'running'].includes(status)) {
    return NextResponse.json({ ok: false, error: "Bad status" }, { status: 400 });
  }

  // Ensure ownership - check both user_id and workspace_id patterns
  const { data: c, error: cErr } = await supabase
    .from("campaigns")
    .select("id, user_id, workspace_id, status")
    .eq("id", params.id)
    .single();

  if (cErr || !c) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Check ownership via user_id or workspace_id
  const isOwner = c.user_id === u.user.id || c.workspace_id === u.user.id;
  if (!isOwner) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  // Map 'running' to 'active' if needed, or use status directly
  const statusToSet = status === 'running' ? 'running' : status;
  
  const { error: upErr } = await supabase
    .from("campaigns")
    .update({ status: statusToSet })
    .eq("id", params.id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Keep PATCH for backward compatibility
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr || !u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json().catch(() => ({}));
  const valid = ["active", "paused", "archived", "running"] as const;
  if (!valid.includes(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  // Ensure ownership
  const { data: c, error: cErr } = await supabase
    .from("campaigns")
    .select("id, workspace_id, status")
    .eq("id", params.id)
    .single();

  if (cErr || !c || c.workspace_id !== u.user.id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { error: upErr } = await supabase
    .from("campaigns")
    .update({ status })
    .eq("id", params.id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}