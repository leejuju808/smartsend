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
  const { cid, email } = params;
  
  try {
    // Insert open event
    await supabase.from("email_events").insert({
      campaign_id: cid,
      recipient_email: decodeURIComponent(email),
      type: "open",
      user_agent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
    });

    // Update campaign_recipients open count
    const { data: recipient } = await supabase
      .from("campaign_recipients")
      .select("open_count")
      .eq("campaign_id", cid)
      .eq("email", decodeURIComponent(email))
      .single();
    
    if (recipient) {
      await supabase
        .from("campaign_recipients")
        .update({
          open_count: (recipient.open_count || 0) + 1,
          last_open_at: new Date().toISOString(),
        })
        .eq("campaign_id", cid)
        .eq("email", decodeURIComponent(email));
    }

    // Trigger automation rules for open event
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/automation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: decodeURIComponent(email), 
          campaign_id: cid, 
          event_type: "open" 
        })
      });
    } catch (error) {
      console.error("Error triggering automation for open:", error);
      // Don't fail the tracking if automation fails
    }
  } catch (error) {
    console.error("Error tracking open:", error);
  }

  // 1x1 transparent PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgMBApDU4wAAAABJRU5ErkJggg==",
    "base64"
  );
  
  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
} 