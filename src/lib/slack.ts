import { supabaseAdmin } from "@/server/supabase";

async function getToken(teamId: string) {
  const { data } = await supabaseAdmin.from("slack_tokens").select("access_token").eq("team_id", teamId).maybeSingle();
  return data?.access_token || null;
}

export async function listSlackChannels(teamId: string) {
  const token = await getToken(teamId);
  if (!token) return [];
  
  const r = await fetch("https://slack.com/api/conversations.list?limit=200", {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const j = await r.json();
  if (!j.ok) return [];
  
  return (j.channels || []).map((c: any) => ({ id: c.id, name: c.name }));
}

export async function postSlack(teamId: string, channel: string, text: string) {
  const token = await getToken(teamId);
  if (!token) return false;
  
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ channel, text })
  });
  
  const j = await r.json();
  return !!j.ok;
}

export async function postSlackBlocks(teamId: string, channel: string, blocks: any[], textFallback = "SmartSendAI") {
  const token = await getToken(teamId);
  if (!token) return false;
  
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({
      channel,
      text: textFallback, // fallback for notifications
      blocks
    })
  });
  
  const j = await r.json();
  return !!j.ok;
} 