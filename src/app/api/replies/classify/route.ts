import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k) => cookieStore.get(k)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const payload = { user_id: user.id, reply_ids: body.reply_ids ?? null };

  const { data, error } = await supabase.functions.invoke("classify-replies", { 
    body: payload 
  });
  
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

  return NextResponse.json(data ?? { processed: 0 });
}

