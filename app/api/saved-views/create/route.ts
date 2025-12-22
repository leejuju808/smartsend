import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin", "member", "viewer"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });

  const body = await req.json();
  const { name, description, filters, sort, scope } = body;

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "not_auth" }, { status: 401 });
  }

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  // Set defaults
  const viewScope = scope === "team" ? "team" : "personal";
  const viewFilters = filters ?? {};
  const viewSort = sort ?? { field: "created_at", dir: "desc" };

  // If this is being set as default, unset other defaults for this user
  if (body.is_default === true) {
    await supabase
      .from("shared_resources")
      .update({ is_default: false })
      .eq("owner_id", user.user.id)
      .eq("kind", "saved_view")
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("shared_resources")
    .insert({
      owner_id: user.user.id,
      kind: "saved_view",
      name: name.trim(),
      description: description?.trim() || null,
      filters: viewFilters,
      sort: viewSort,
      scope: viewScope,
      is_default: body.is_default ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating saved view:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, view: data });
}












