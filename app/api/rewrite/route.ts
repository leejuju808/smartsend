import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const sb = createClient();
  const user = await sb.auth.getUser();
  
  if (!user.data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, tone, focus } = await req.json();

  const supabaseFunctionsUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL || 
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

  const r = await fetch(`${supabaseFunctionsUrl}/rewrite-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account_id: user.data.user.id,
      text,
      tone,
      focus
    })
  });
  
  const data = await r.json();
  return NextResponse.json(data);
}
