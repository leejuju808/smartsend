import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// GET /api/track/click?mid=<uuid>&tid=<uuid>&u=<base64url>
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mid = searchParams.get("mid");
    const tid = searchParams.get("tid");
    const u = searchParams.get("u");
    if (!mid || !tid || !u) return NextResponse.redirect("https://example.com", 302);

    const url = Buffer.from(u, "base64url").toString("utf-8");

    const { data: msg } = await supabase
      .from("campaign_messages")
      .select("id, workspace_id, campaign_id, tracking_id")
      .eq("id", mid).single();

    if (msg && msg.tracking_id === tid) {
      await supabase.from("email_events").insert({
        workspace_id: msg.workspace_id,
        campaign_id: msg.campaign_id,
        message_id: msg.id,
        tracking_id: msg.tracking_id,
        type: "click",
        url
      });

      // increment click counter
      await supabase.rpc("incr_message_field", { p_id: msg.id, p_field: "click_count" }).catch(async () => {
        const { data } = await supabase.from("campaign_messages").select("click_count").eq("id", msg.id).single();
        await supabase.from("campaign_messages").update({
          click_count: (data?.click_count ?? 0) + 1,
          last_click_at: new Date().toISOString(),
        }).eq("id", msg.id);
      });
    }

    return NextResponse.redirect(url, 302);
  } catch (e) {
    return NextResponse.redirect("https://example.com", 302);
  }
}
