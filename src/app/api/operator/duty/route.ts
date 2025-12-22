import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

/**
 * GET /api/operator/duty
 * Returns current duty assignment + computed on-duty operator.
 *
 * PATCH /api/operator/duty
 * Body: { primary_user_id?: string|null, backup_user_id?: string|null }
 * Owner/Admin only. Sets duty assignment.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    p_ws: workspaceId,
    p_uid: user.id,
  });
  if (!isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createServiceClient();

  const { data: duty } = await admin
    .from("ss_duty_assignments")
    .select("workspace_id, primary_user_id, backup_user_id, updated_by, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: onDuty } = await admin
    .rpc("ss_get_on_duty_operator", { p_workspace_id: workspaceId })
    .catch(() => ({ data: null } as any));

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    duty: duty || null,
    on_duty_user_id: onDuty || null,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  // Owner/admin only.
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", {
    p_ws: workspaceId,
    p_uid: user.id,
  });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const primary = (body as any)?.primary_user_id ?? null;
  const backup = (body as any)?.backup_user_id ?? null;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("ss_duty_assignments")
    .upsert(
      {
        workspace_id: workspaceId,
        primary_user_id: primary,
        backup_user_id: backup,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    )
    .select("workspace_id, primary_user_id, backup_user_id, updated_by, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Repair (turnover-safe) and return computed on-duty.
  await admin.rpc("ss_duty_assignments_repair", { p_workspace_id: workspaceId }).catch(() => null);
  const { data: onDuty } = await admin.rpc("ss_get_on_duty_operator", { p_workspace_id: workspaceId }).catch(() => ({ data: null } as any));

  return NextResponse.json({ ok: true, duty: data, on_duty_user_id: onDuty || null });
}



