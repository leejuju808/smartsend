import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertEditorByStep, assertViewerByStep } from "@/lib/acl";

const Body = z.object({
  preset_id: z.string().uuid().optional(),
  goal: z.string().max(600).optional(),
  n: z.number().int().min(1).max(6).optional(),
  insert: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { stepId: string } }) {
  await assertViewerByStep(params.stepId).catch(() => {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  });

  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("variant_rewrite_jobs")
    .select("id,created_at,goal,n,status,error,preset_id")
    .eq("step_id", params.stepId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { stepId: string } }) {
  await assertEditorByStep(params.stepId).catch(() => {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  });

  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: userRes } = await supabase.auth.getUser();

  const { data: job, error: insertError } = await supabase
    .from("variant_rewrite_jobs")
    .insert({
      user_id: userRes?.user?.id ?? null,
      step_id: params.stepId,
      preset_id: parsed.data.preset_id ?? null,
      goal: parsed.data.goal ?? null,
      n: parsed.data.n ?? 3,
      status: "queued",
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const query = new URLSearchParams({
    stepId: params.stepId,
    n: String(parsed.data.n ?? 3),
  });

  if (parsed.data.preset_id) {
    query.set("presetId", parsed.data.preset_id);
  }

  if (parsed.data.insert) {
    query.set("insert", "1");
  }

  const fn = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/variant-rewrite?${query.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ goal: parsed.data.goal ?? "" }),
    }
  );

  let output: any;
  try {
    output = await fn.json();
  } catch {
    output = { error: "invalid_response" };
  }

  await supabase
    .from("variant_rewrite_jobs")
    .update({
      status: output?.ok ? "success" : "error",
      error: output?.ok ? null : JSON.stringify(output),
    })
    .eq("id", job.id);

  if (!output?.ok) {
    return NextResponse.json({ error: output }, { status: 500 });
  }

  return NextResponse.json(output);
}




