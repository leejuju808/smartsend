import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertEditorByStep } from "@/lib/acl";

const Body = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  weight: z.number().int().min(0).max(100).default(1),
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
  is_html: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { stepId: string } }) {
  await assertEditorByStep(params.stepId).catch(() => {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  });

  const supabase = createRouteHandlerClient({ cookies });
  const p = Body.safeParse(await req.json().catch(() => ({})));

  if (!p.success) {
    return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  }

  const row = { ...p.data, step_id: params.stepId };
  const { data, error } = await supabase
    .from("step_variants")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}



