import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const campId = params.id;

  // Pull 7d windows
  const from = new Date(); from.setDate(from.getDate()-6); from.setHours(0,0,0,0);
  const to = new Date(); to.setHours(23,59,59,999);
  const days: string[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
    days.push(d.toISOString().slice(0,10));
  }

  const [{ data: sent }, { data: reps }, { data: labels }] = await Promise.all([
    supabase.from("v_sent_daily").select("*").eq("campaign_id", campId).gte("day", days[0]),
    supabase.from("v_replies_daily").select("*").eq("campaign_id", campId).gte("day", days[0]),
    supabase.from("v_labels_daily").select("*").eq("campaign_id", campId).gte("day", days[0]),
  ]);

  const sentMap = new Map(sent?.map((r:any)=>[r.day, r.sent]) || []);
  const repMap  = new Map(reps?.map((r:any)=>[r.day, r.replies]) || []);
  const unsubMap = new Map((labels||[]).filter((x:any)=>x.ai_label==='unsubscribe').map((r:any)=>[r.day, r.cnt]));
  const bounceMap= new Map((labels||[]).filter((x:any)=>x.ai_label==='bounce').map((r:any)=>[r.day, r.cnt]));

  const series = days.map(day => {
    const s = sentMap.get(day) || 0;
    const r = repMap.get(day) || 0;
    return {
      day,
      sent: s,
      replies: r,
      reply_rate: s ? Number((r/s).toFixed(4)) : 0,
      unsub: unsubMap.get(day) || 0,
      bounce: bounceMap.get(day) || 0,
      bad_rate: s ? Number((( (unsubMap.get(day)||0) + (bounceMap.get(day)||0) )/s).toFixed(4)) : 0
    };
  });

  return NextResponse.json({ series });
}
