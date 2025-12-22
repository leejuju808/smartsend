import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { send } from "@/lib/mail/adapter";
import { z } from "zod";

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  provider: z.enum(["auto", "gmail", "outlook"]).optional().default("auto"),
  orgId: z.string().uuid(),
  thread: z.object({
    messageId: z.string().optional(),
    provider: z.enum(["gmail", "outlook"]).optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    const body = await req.json();
    const validated = sendSchema.parse(body);
    
    const r = await send(validated);
    return NextResponse.json(r);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: e.errors }, { status: 400 });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

