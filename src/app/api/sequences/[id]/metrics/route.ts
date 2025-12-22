import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function GET(_:any,{params}:{params:{id:string}}){
  const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies:{ get:(k)=>cookies().get(k)?.value }});
  const { data:{ user }} = await sb.auth.getUser(); if(!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  // Get step performance metrics
  const { data: steps, error } = await sb
    .from("sequence_steps")
    .select(`
      id,
      position,
      sequence_jobs!inner(
        id,
        sent_at,
        email_opens(count),
        email_clicks(count)
      )
    `)
    .eq("sequence_id", params.id)
    .order("position");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Process metrics
  const processedSteps = steps?.map((step: any) => ({
    step_id: step.id,
    position: step.position,
    sent_jobs: step.sequence_jobs?.length || 0,
    unique_opens: step.sequence_jobs?.reduce((sum: number, job: any) => sum + (job.email_opens?.length || 0), 0) || 0,
    unique_clicks: step.sequence_jobs?.reduce((sum: number, job: any) => sum + (job.email_clicks?.length || 0), 0) || 0
  })) || [];

  return NextResponse.json({ steps: processedSteps });
}