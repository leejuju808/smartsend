import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type OOOResult = { is_ooo: boolean; return_date?: string | null; notes?: string };

function extractOOO(text: string): OOOResult {
  const t = text.toLowerCase();
  // quick heuristics first (fast path)
  const isLikely = /(out of office|ooo|vacation|annual leave|away from the office)/i.test(text);
  if (!isLikely) return { is_ooo: false };

  // return-date patterns (e.g., "back on Nov 28", "returning 12/02/2025", "back Monday")
  const iso = (d: Date) => d.toISOString().slice(0,10);
  const today = new Date();

  // explicit mm/dd/yyyy or mm/dd
  const mdY = text.match(/\b(\d{1,2})[\/\-](\d{1,2})([\/\-](\d{2,4}))?\b/);
  if (mdY) {
    const m = parseInt(mdY[1]); const d = parseInt(mdY[2]); const y = mdY[3] ? parseInt(mdY[3].replace(/[\/\-]/,'')) : today.getFullYear();
    const year = y < 100 ? 2000 + y : y;
    const dt = new Date(year, m-1, d);
    if (!isNaN(dt.getTime())) return { is_ooo: true, return_date: iso(dt), notes: "mdY" };
  }

  // natural month name
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
  const nameD = new RegExp(`\\bback (on )?${month} (\\d{1,2})\\b`, "i").exec(text);
  if (nameD) {
    const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
    const mm = months[nameD[1].slice(0,3).toLowerCase() as keyof typeof months];
    const dd = parseInt(nameD[2]);
    const dt = new Date(today.getFullYear(), mm, dd);
    if (!isNaN(dt.getTime())) return { is_ooo: true, return_date: iso(dt), notes: "MonthName" };
  }

  // weekday like "back Monday"
  const wd = /(back|returning)\s+(mon|tue|wed|thu|thur|fri|sat|sun)[a-z]*/i.exec(t);
  if (wd) {
    const idx = ["sun","mon","tue","wed","thu","fri","sat"].indexOf(wd[2].slice(0,3));
    const diff = (idx - today.getDay() + 7) % 7 || 7; // next occurrence, at least +1 day
    const dt = new Date(today); dt.setDate(today.getDate() + diff);
    return { is_ooo: true, return_date: iso(dt), notes: "Weekday" };
  }

  // fallback: OOO without date
  return { is_ooo: true, return_date: null, notes: "NoDate" };
}

serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { reply_id } = await req.json();

  // Try to find reply in various possible tables
  let r: any = null;
  
  // Try replies table first
  const { data: reply1 } = await sb.from("replies")
    .select("id, campaign_id, contact_id, lead_id, reply_text, body, body_text")
    .eq("id", reply_id).maybeSingle();
  
  if (reply1) {
    r = {
      id: reply1.id,
      campaign_id: reply1.campaign_id,
      contact_id: reply1.contact_id || reply1.lead_id,
      reply_text: reply1.reply_text || reply1.body || reply1.body_text
    };
  } else {
    // Try inbound_messages table
    const { data: reply2 } = await sb.from("inbound_messages")
      .select("id, campaign_id, contact_id, lead_id, text_body, snippet, body_text")
      .eq("id", reply_id).maybeSingle();
    
    if (reply2) {
      r = {
        id: reply2.id,
        campaign_id: reply2.campaign_id,
        contact_id: reply2.contact_id || reply2.lead_id,
        reply_text: reply2.text_body || reply2.snippet || reply2.body_text
      };
    } else {
      // Try messages table
      const { data: reply3 } = await sb.from("messages")
        .select("id, campaign_id, contact_id, lead_id, body_text, body_html")
        .eq("id", reply_id).maybeSingle();
      
      if (reply3) {
        r = {
          id: reply3.id,
          campaign_id: reply3.campaign_id,
          contact_id: reply3.contact_id || reply3.lead_id,
          reply_text: reply3.body_text || reply3.body_html
        };
      }
    }
  }

  if (!r || !r.campaign_id || !r.contact_id) {
    return new Response(JSON.stringify({ ok:false, error:"not_found" }), { 
      headers:{"Content-Type":"application/json"}, 
      status:404 
    });
  }

  const out = extractOOO(r.reply_text || "");
  if (!out.is_ooo) {
    return new Response(JSON.stringify({ ok:true, is_ooo:false }), { 
      headers:{ "Content-Type":"application/json" } 
    });
  }

  // mark label
  await sb.from("reply_training_labels").upsert({
    reply_id: r.id, 
    campaign_id: r.campaign_id, 
    contact_id: r.contact_id,
    reply_text: r.reply_text, 
    reply_kind: "ooo", 
    labeled_at: new Date().toISOString()
  }, { onConflict: "reply_id" });

  // pause the sequence
  await sb.from("campaign_contacts").update({
    is_paused: true,
    pause_reason: "ooo",
    pause_until: out.return_date ? out.return_date : null,
    ooo_detected_at: new Date().toISOString(),
    ooo_return_date: out.return_date ? out.return_date : null,
    ooo_notes: out.notes
  }).eq("campaign_id", r.campaign_id).eq("contact_id", r.contact_id);

  return new Response(JSON.stringify({ 
    ok:true, 
    is_ooo:true, 
    return_date: out.return_date, 
    notes: out.notes 
  }), {
    headers:{ "Content-Type":"application/json" }
  });
});
