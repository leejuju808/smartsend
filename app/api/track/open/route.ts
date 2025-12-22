import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Tiny transparent PNG (base64)
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/Ut9tDMAAAAASUVORK5CYII=";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mid = searchParams.get("mid");        // campaign_messages.id (uuid)
    const tid = searchParams.get("tid");        // tracking_id (uuid)

    if (!mid || !tid) {
      return new NextResponse(Buffer.from(PNG_BASE64, "base64"), {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store, private" }
      });
    }

    // Fetch message to get workspace/campaign
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
        type: "open",
        user_agent: "", // UA not available in edge runtime reliably
      });

      await supabase
        .from("campaign_messages")
        .update({ open_count: supabase.rpc("incr_send_counter") ? undefined : undefined }) // no-op placeholder
        .eq("id", msg.id);

      // Atomic counters without RPC, simple UPSERT:
      await supabase.rpc("incr_message_field", { p_id: msg.id, p_field: "open_count" }).catch(async () => {
        // fallback if RPC not present
        const { data } = await supabase.from("campaign_messages").select("open_count").eq("id", msg.id).single();
        await supabase.from("campaign_messages").update({
          open_count: (data?.open_count ?? 0) + 1,
          last_open_at: new Date().toISOString(),
        }).eq("id", msg.id);
      });
    }

    return new NextResponse(Buffer.from(PNG_BASE64, "base64"), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store, private" }
    });
  } catch {
    return new NextResponse(Buffer.from(PNG_BASE64, "base64"), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store, private" }
    });
  }
}
