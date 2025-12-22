import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";

export async function GET() {
  const sb = getServerSupabase();
  const org = await getActiveOrg(); 
  if (!org) return NextResponse.json({ sent: 0, opens: 0, clicks: 0, openRate: 0, ctr: 0 });

  const since = new Date(Date.now() - 30*24*3600*1000).toISOString();

  const [{ data: sent }, { data: opens }, { data: clicks }] = await Promise.all([
    sb.from("send_jobs").select("id").eq("org_id", org.id).eq("status","sent").gte("created_at", since),
    sb.from("email_events").select("id").eq("org_id", org.id).eq("type","open").gte("created_at", since),
    sb.from("email_events").select("id").eq("org_id", org.id).eq("type","click").gte("created_at", since)
  ]);

  const s = sent?.length ?? 0, o = opens?.length ?? 0, c = clicks?.length ?? 0;
  const openRate = s ? Math.round((o / s) * 100) : 0;
  const ctr = s ? Math.round((c / s) * 100) : 0;

  return NextResponse.json({ sent: s, opens: o, clicks: c, openRate, ctr });
}