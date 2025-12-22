import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { forceSync } from "@/lib/mail/adapter";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { orgId } = await req.json();
  if (!orgId) return NextResponse.json({ error: "missing orgId" }, { status: 400 });
  
  const r = await forceSync(orgId);
  return NextResponse.json({ ok: true, results: r });
}

