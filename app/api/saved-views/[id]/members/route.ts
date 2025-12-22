import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase credentials are not configured");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type UpdateBody = {
  user_id?: string;
  role?: "viewer" | "editor" | "owner";
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: UpdateBody;

  try {
    body = (await req.json()) ?? {};
  } catch (error) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.user_id || !body.role) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  if (!["viewer", "editor", "owner"].includes(body.role)) {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("saved_view_memberships")
    .select("role")
    .eq("view_id", params.id)
    .eq("user_id", body.user_id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 400 });
  }

  if (!membership) {
    return NextResponse.json({ ok: false, error: "membership_not_found" }, { status: 404 });
  }

  if (membership.role === "owner" && body.role !== "owner") {
    return NextResponse.json({ ok: false, error: "cannot_modify_owner_role" }, { status: 400 });
  }

  const { error } = await supabase
    .from("saved_view_memberships")
    .update({ role: body.role })
    .eq("view_id", params.id)
    .eq("user_id", body.user_id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("saved_view_memberships")
    .select("role")
    .eq("view_id", params.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 400 });
  }

  if (!membership) {
    return NextResponse.json({ ok: true });
  }

  if (membership.role === "owner") {
    return NextResponse.json({ ok: false, error: "cannot_remove_owner" }, { status: 400 });
  }

  const { error } = await supabase
    .from("saved_view_memberships")
    .delete()
    .eq("view_id", params.id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

