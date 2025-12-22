import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

async function resolveWorkspaceId(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  }
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 500 }) };
  }

  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: "Workspace not found" }, { status: 404 }) };
  }

  return { workspaceId: profile.workspace_id as string };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const resolved = await resolveWorkspaceId(supabase);
  if ("error" in resolved) return resolved.error;

  const { data, error } = await supabase
    .from("campaigns")
    .select("ooo_autonudge_enabled")
    .eq("id", params.id)
    .eq("workspace_id", resolved.workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: data.ooo_autonudge_enabled ?? true,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const resolved = await resolveWorkspaceId(supabase);
  if ("error" in resolved) return resolved.error;

  let body: { enabled?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Field 'enabled' must be a boolean." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update({ ooo_autonudge_enabled: body.enabled })
    .eq("id", params.id)
    .eq("workspace_id", resolved.workspaceId)
    .select("ooo_autonudge_enabled")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ enabled: data.ooo_autonudge_enabled });
}





