import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertEditorByStep } from "@/lib/acl";

const Body = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        weight: z.number().int().min(0).max(100),
        active: z.boolean(),
      }),
    )
    .min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { stepId: string } },
) {
  await assertEditorByStep(params.stepId).catch(() => {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  });

  const supabase = createRouteHandlerClient({ cookies });

  const bodyJson = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(bodyJson);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = parsed.data.items.map((item) => ({
    id: item.id,
    step_id: params.stepId,
    weight: item.weight,
    active: item.active,
  }));

  const { error } = await supabase.from("step_variants").upsert(rows, {
    onConflict: "id",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



