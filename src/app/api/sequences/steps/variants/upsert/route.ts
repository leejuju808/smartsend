// app/api/sequences/steps/variants/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest){
  const { stepId, variants } = await req.json(); // [{key, weight_pct, subject_template, html_template}]
  
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("sequence_step_variants").delete().eq("step_id", stepId);
  const { error } = await supabase.from("sequence_step_variants").insert(
    (variants||[]).map((v:any)=>({ step_id: stepId, ...v }))
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok:true });
}