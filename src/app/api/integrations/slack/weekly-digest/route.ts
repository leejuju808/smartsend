import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { postSlackBlocks } from "@/lib/slack";
import { leaderboardBlocks } from "@/lib/slackBlocks";

export async function POST() {
  // find all teams with Slack + settings
  const { data: rows } = await supabaseAdmin
    .from("slack_tokens").select("team_id");
    
  for (const r of rows || []) {
    const { data: set } = await supabaseAdmin
      .from("slack_settings").select("channel_id, post_weekly_digest").eq("team_id", r.team_id).maybeSingle();
    if (!set?.post_weekly_digest || !set.channel_id) continue;

    // compute last 7 days
    const start = new Date(); 
    start.setDate(start.getDate()-7);
    
    const { data: lb } = await supabaseAdmin.rpc("leaderboard_for_team", { tid: r.team_id });
    const lines = (lb||[]).slice(0,5).map((row:any, i:number) =>
      `${i+1}. ${row.email} — ${row.replies} replies, ${row.meetings} meetings`);
      
    await postSlackBlocks(r.team_id, set.channel_id, leaderboardBlocks(lines));
  }
  
  return NextResponse.json({ ok:true });
} 