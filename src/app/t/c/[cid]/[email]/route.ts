import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { cid: string; email: string } }
) {
  const url = req.nextUrl.searchParams.get("u");
  if (!url) {
    return NextResponse.json({ error: "Missing u parameter" }, { status: 400 });
  }

  try {
    // Insert click event
    await supabase.from("email_events").insert({
      campaign_id: params.cid,
      recipient_email: decodeURIComponent(params.email),
      type: "click",
      url,
      user_agent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
    });

    // Update campaign_recipients click count
    const { data: recipient } = await supabase
      .from("campaign_recipients")
      .select("click_count")
      .eq("campaign_id", params.cid)
      .eq("email", decodeURIComponent(params.email))
      .single();
    
    if (recipient) {
      await supabase
        .from("campaign_recipients")
        .update({
          click_count: (recipient.click_count || 0) + 1,
          last_click_at: new Date().toISOString(),
        })
        .eq("campaign_id", params.cid)
        .eq("email", decodeURIComponent(params.email));
    }

    // 1) Look up click actions for this campaign
    const { data: actions } = await supabase
      .from("click_actions")
      .select("*")
      .eq("campaign_id", params.cid);

    // 2) Process each action if URL matches
    for (const action of actions || []) {
      if (url.includes(action.match_url)) {
        if (action.action === "tag") {
          // Add tag to contact
          await supabase.rpc("add_contact_tag", { 
            p_email: decodeURIComponent(params.email), 
            p_tag: action.value 
          });
        }
        
        if (action.action === "followup_campaign") {
          // Seed recipient into new campaign
          await supabase.from("campaign_recipients").upsert({
            campaign_id: action.value,
            email: decodeURIComponent(params.email),
            status: "pending"
          }, { onConflict: "campaign_id,email" });
        }
        
        if (action.action === "suppress") {
          // Suppress this email address
          await supabase.from("suppression_emails").upsert({ 
            email: decodeURIComponent(params.email), 
            source: "click", 
            reason: "click_suppress" 
          });
        }
      }
    }

    // Trigger automation rules for click event
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/automation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: decodeURIComponent(params.email), 
          campaign_id: params.cid, 
          event_type: "click",
          url 
        })
      });
    } catch (error) {
      console.error("Error triggering automation for click:", error);
      // Don't fail the tracking if automation fails
    }
  } catch (error) {
    console.error("Error tracking click:", error);
  }

  return NextResponse.redirect(url);
} 