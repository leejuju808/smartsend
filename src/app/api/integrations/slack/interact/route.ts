import { NextRequest, NextResponse } from "next/server";
import { verifySlack } from "@/lib/slackVerify";

function parseFormEncoded(body: string) {
  const params = new URLSearchParams(body);
  return params.get("payload");
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  if (!verifySlack(req as any, bodyText)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = JSON.parse(parseFormEncoded(bodyText) || "{}");
  // payload.type === 'block_actions'
  const action = payload?.actions?.[0];
  const actionId = action?.action_id;
  const value = action?.value;
  const responseUrl = payload?.response_url;

  // For simple buttons that open a URL, Slack can handle with "url" in the button; no server needed.
  // For server-handled actions (e.g., generate snippet and reply ephemerally):
  if (actionId === "insert_meeting_snippet") {
    // build snippet quickly
    const text = `How's one of these times?\n• Option 1: ${new Date(Date.now()+86400000).toLocaleString()}\n• Option 2: ${new Date(Date.now()+2*86400000).toLocaleString()}\n\nAdd to calendar: ${process.env.NEXT_PUBLIC_SITE_URL}/ics/intro.ics`;
    
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        response_type: "ephemeral", 
        text 
      })
    });
    
    return NextResponse.json({ ok: true });
  }

  // Default ack
  return NextResponse.json({ ok: true });
} 