import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertEditorByStep } from "@/lib/acl";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { stepId: string; variantId: string } },
) {
  await assertEditorByStep(params.stepId).catch(() => {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  });

  const supabase = createRouteHandlerClient({ cookies });

  const { count, error: cntErr } = await supabase
    .from("send_queue")
    .select("id", { head: true, count: "exact" })
    .eq("variant_id", params.variantId);

  if (cntErr) {
    return NextResponse.json({ error: cntErr.message }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "variant_in_use" }, { status: 409 });
  }

  const { error } = await supabase
    .from("step_variants")
    .delete()
    .eq("id", params.variantId)
    .eq("step_id", params.stepId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



