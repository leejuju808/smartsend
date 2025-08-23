import { NextRequest, NextResponse } from "next/server";
import { postSlack } from "@/lib/slack";

export async function POST(req: NextRequest) {
  const { team_id, channel_id, text } = await req.json();
  if (!team_id || !channel_id || !text) return NextResponse.json({ error:"bad" }, { status:400 });
  
  const ok = await postSlack(team_id, channel_id, text);
  return NextResponse.json({ ok });
} 