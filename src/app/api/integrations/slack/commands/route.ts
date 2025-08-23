import { NextRequest, NextResponse } from "next/server";
import { verifySlack } from "@/lib/slackVerify";
import { supabaseAdmin } from "@/server/supabase";
import { insertMeetingBlocks } from "@/lib/slackBlocks";

// util: parse x-www-form-urlencoded
async function parseForm(req: NextRequest) {
  const text = await req.text();
  const ok = verifySlack(req as any, text);
  if (!ok) return { ok: false } as any;
  const params = new URLSearchParams(text);
  return {
    ok: true,
    team_id: params.get("team_id") || "",
    channel_id: params.get("channel_id") || "",
    user_id: params.get("user_id") || "",
    response_url: params.get("response_url") || "",
    text: params.get("text")?.trim() || ""
  };
}

export async function POST(req: NextRequest) {
  const parsed = await parseForm(req);
  if (!parsed.ok) return NextResponse.json({ text: "Unauthorized" }, { status: 401 });

  const { channel_id, text, response_url } = parsed;
  const [cmd, ...args] = text.split(/\s+/);
  // Immediate ack so Slack doesn't timeout
  const ack = NextResponse.json({ response_type: "ephemeral", text: "Working…" });

  // handle async via response_url
  (async () => {
    try {
      if (!cmd || cmd === "help") {
        await reply(response_url,
          "*SmartSendAI commands:*\n• `/smartsend roi`\n• `/smartsend leaderboard`\n• `/smartsend insert-meeting [email|@user] [duration=30]`");
        return;
      }

      if (cmd === "roi") {
        const s = await getSummaryForSlack(channel_id);
        await reply(response_url, `*ROI*\n• AI replies: *${s.replies}*\n• Meetings: *${s.meetings}*\n• Hours saved: *${s.hours}h*\n\n_Upgrade for more:_ ${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing`);
        return;
      }

      if (cmd === "leaderboard") {
        const lines = await leaderboardLines(channel_id);
        await reply(response_url, `*Team Leaderboard (7d)*\n${lines.join("\n")}\n\n_Add seats →_ ${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/team`);
        return;
      }

      if (cmd === "insert-meeting") {
        // Use blocks for better UX
        await replyWithBlocks(response_url, insertMeetingBlocks());
        return;
      }

      await reply(response_url, "Unknown command. Try `/smartsend help`.");
    } catch (e:any) {
      await reply(response_url, `Error: ${e?.message || "Something went wrong."}`);
    }
  })();

  return ack;
}

// helpers
async function reply(response_url: string, text: string) {
  await fetch(response_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response_type: "ephemeral", text }) });
}

async function replyWithBlocks(response_url: string, blocks: any[]) {
  await fetch(response_url, { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify({ 
      response_type: "ephemeral", 
      blocks 
    }) 
  });
}

function pad(n:number){return n<10?`0${n}`:`${n}`;}
function toICSDate(dt:Date){return dt.getUTCFullYear()+pad(dt.getUTCMonth()+1)+pad(dt.getUTCDate())+"T"+pad(dt.getUTCHours())+pad(dt.getUTCMinutes())+pad(dt.getUTCSeconds())+"Z";}
function makeICS({title,desc,start,end,location}:{title:string;desc:string;start:Date;end:Date;location?:string;}) {
  const uid = `${Date.now()}@smartsendai`;
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//SmartSendAI//Meeting//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    "UID:"+uid,"DTSTAMP:"+toICSDate(new Date()),"DTSTART:"+toICSDate(start),"DTEND:"+toICSDate(end),
    "SUMMARY:"+title.replace(/\r?\n/g," "), "DESCRIPTION:"+desc.replace(/\r?\n/g," "), "LOCATION:"+(location||""),"END:VEVENT","END:VCALENDAR"];
  const blob = Buffer.from(lines.join("\r\n")).toString("base64");
  // Slack can't attach files via response_url; include data link
  return `data:text/calendar;base64,${blob}`;
}

function nextSlots(minutes:number){
  const base = new Date();
  const out: {start:Date; end:Date}[] = [];
  let day = 0;
  while(out.length < 3 && day < 10){
    const d = new Date(base); d.setDate(d.getDate()+day);
    const dow = d.getDay(); if (dow===0 || dow===6){ day++; continue; }
    for (const h of [10,14,16]){
      const s = new Date(d); s.setHours(h,0,0,0);
      if (s > base) { const e = new Date(s.getTime()+minutes*60000); out.push({start:s,end:e}); if (out.length>=3) break; }
    }
    day++;
  }
  return out;
}

function parseMeetingArgs(args:string[]){
  let email = "";
  let dur = 30;
  for (const a of args){
    if (/^\d+$/.test(a)) dur = parseInt(a,10);
    else if (a.startsWith("@") || a.includes("@")) email = a.replace(/^@/,"");
  }
  return { email, dur };
}

async function buildMeetingSnippet(email:string, dur:number){
  // Optionally lookup contact/company from your DB; keep simple here
  const slots = nextSlots(dur);
  const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL || "";
  const lines = ["How's one of these times?"];
  slots.forEach((s,i)=> lines.push(`• Option ${i+1}: ${s.start.toLocaleString([], { dateStyle:"medium", timeStyle:"short" })}`));
  if (calendly) lines.push(`\nOr pick any time: ${calendly}`);
  const icsUrl = makeICS({ title:"Intro call – SmartSendAI", desc:"Quick intro + how we boost reply→meeting conversion.", start:slots[0].start, end:slots[0].end, location:calendly||"Video call" });
  lines.push(`Add to calendar: ${icsUrl}`);
  return { text: lines.join("\n") };
}

// data lookups bridging Slack channel -> your team
async function getTeamIdByChannel(channel_id: string){
  // using slack_settings table
  const { data } = await supabaseAdmin.from("slack_settings").select("team_id").eq("channel_id", channel_id).maybeSingle();
  return data?.team_id || null;
}

async function getSummaryForSlack(channel_id: string){
  const teamId = await getTeamIdByChannel(channel_id);
  if (!teamId) return { replies:0, meetings:0, hours:0 };
  const { count: replies } = await supabaseAdmin.from("ai_reply_events").select("id", { count:"exact", head:true }).eq("team_id", teamId);
  const { count: meetings } = await supabaseAdmin.from("ai_reply_events").select("id", { count:"exact", head:true }).eq("team_id", teamId).eq("meeting_booked", true);
  const hours = Math.round((((replies||0) * 5)/60)*10)/10;
  return { replies: replies||0, meetings: meetings||0, hours };
}

async function leaderboardLines(channel_id:string){
  const teamId = await getTeamIdByChannel(channel_id);
  if (!teamId) return ["(No team linked to this channel.)"];
  const { data } = await supabaseAdmin.rpc("leaderboard_for_team", { tid: teamId });
  const top = (data||[]).slice(0,5);
  if (!top.length) return ["No activity yet."];
  return top.map((r:any,i:number)=> `${i+1}. ${r.email} — ${r.replies} replies, ${r.meetings} meetings`);
} 