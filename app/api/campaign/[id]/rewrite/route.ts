import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  subject: z.string().optional(),
  body_html: z.string().optional(),
  tone: z.enum(["friendly", "professional", "concise", "assertive", "warm"]).optional(),
  length: z.enum(["short", "medium", "long"]).optional(),
  goal: z.enum(["followup", "intro", "pitch", "bump"]).optional(),
  variants: z.number().min(1).max(3).optional(),
  preset: z.string().optional(),
  context: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const j = await req.json().catch(() => ({}));
  const b = Body.safeParse(j);
  if (!b.success) {
    return NextResponse.json({ error: b.error.flatten() }, { status: 400 });
  }

  let presetVars: Record<string, string> = {};
  let tone = b.data.tone;
  let length = b.data.length;
  let cta: string | undefined;

  if (b.data.preset) {
    const { data: pr } = await supabase
      .from("rewrite_presets")
      .select("*")
      .eq("campaign_id", params.id)
      .eq("name", b.data.preset)
      .maybeSingle();
    if (pr) {
      tone = tone ?? (pr.tone as typeof tone);
      length = length ?? (pr.length as typeof length);
      cta = pr.cta ?? undefined;
      presetVars = (pr.variables ?? {}) as Record<string, string>;
    }
  }

  const mergedVars = { ...presetVars, ...(b.data.context ?? {}) };
  if (cta) {
    mergedVars["offer"] = cta;
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/rewrite`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({
        subject: b.data.subject ?? "",
        body_html: b.data.body_html ?? "",
        tone: tone ?? "professional",
        length: length ?? "short",
        goal: b.data.goal ?? "intro",
        variants: b.data.variants ?? 1,
        context: mergedVars,
        campaign_id: params.id,
        source: "composer",
      }),
    },
  );

  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: out?.error ?? "rewrite failed" },
      { status: 500 },
    );
  }
  return NextResponse.json(out);
}

