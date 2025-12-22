import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { job: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { campaign_id } = await req.json();

  const { data, error } = await supabase.rpc("apply_import_job", {
    p_job: params.job, p_user: user.id, p_campaign: campaign_id ?? null
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Audit (if log_audit function exists)
  try {
    await supabase.rpc("log_audit", {
      p_actor: user.id, p_campaign: campaign_id ?? null,
      p_entity_type: "settings", p_entity: params.job,
      p_action: "import_apply", p_meta: { applied: data, campaign_id }
    });
  } catch (auditError) {
    // Non-critical, continue
    console.warn("Audit log failed:", auditError);
  }

  return NextResponse.json({ ok: true, applied: data });
}



