import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({ resume: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const resume = parsed.success ? parsed.data.resume ?? true : true;

  const { data, error } = await supabase.rpc("unpause_thread", {
    p_thread: params.threadId,
    p_resume: resume,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: !!data });
}




