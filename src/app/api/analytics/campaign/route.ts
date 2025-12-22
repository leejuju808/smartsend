import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get("campaignId")
  const days = Math.min(parseInt(searchParams.get("days") || "30", 10), 180)
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 })

  const supabase = getServerSupabase()

  // Pull daily (last N days)
  const since = new Date(); since.setDate(since.getDate() - days)
  const { data: daily, error: e1 } = await supabase
    .from("v_campaign_daily")
    .select("*")
    .eq("campaign_id", campaignId)
    .gte("day", since.toISOString().slice(0,10))
    .order("day", { ascending: true })
  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 })

  // Provider split
  const { data: split, error: e2 } = await supabase
    .from("v_campaign_provider_split")
    .select("*")
    .eq("campaign_id", campaignId)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })

  // Totals
  const totals = daily?.reduce((acc, d) => {
    acc.sent += d.sent; acc.opens += d.opens; acc.clicks += d.clicks
    acc.unique_openers += d.unique_openers; acc.unique_clickers += d.unique_clickers
    return acc
  }, { sent:0, opens:0, clicks:0, unique_openers:0, unique_clickers:0 }) || { sent:0, opens:0, clicks:0, unique_openers:0, unique_clickers:0 }

  return NextResponse.json({ daily, split, totals })
}