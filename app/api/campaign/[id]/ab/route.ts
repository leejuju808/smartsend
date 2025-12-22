import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  name: z.string().min(2),
  kind: z.enum(["subject", "copy"]).default("copy"),
  subject_a: z.string().optional(),
  body_a: z.string().optional(),
  subject_b: z.string().optional(),
  body_b: z.string().optional(),
  weight_a: z.number().min(1).max(99).default(50),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const j = await req.json().catch(() => ({}));
  const b = Body.safeParse(j);
  if (!b.success) {
    return NextResponse.json({ error: b.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_ab_test", {
    p_campaign: params.id,
    p_name: b.data.name,
    p_kind: b.data.kind,
    p_subject_a: b.data.subject_a ?? null,
    p_html_a: b.data.body_a ?? null,
    p_subject_b: b.data.subject_b ?? null,
    p_html_b: b.data.body_b ?? null,
    p_weight_a: b.data.weight_a,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, test_id: data });
}

