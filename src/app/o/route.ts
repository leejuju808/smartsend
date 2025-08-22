import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

const GIF_1PX = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k");
  if (k) {
    try {
      const { data } = await supabaseAdmin
        .from("outbound_messages")
        .select("id, open_first_at, open_count")
        .eq("tracking_key", k)
        .maybeSingle();
      if (data) {
        const id = (data as any).id as string;
        const openFirstAt = (data as any).open_first_at as string | null;
        const openCount = (data as any).open_count as number | null;
        if (!openFirstAt) {
          await supabaseAdmin
            .from("outbound_messages")
            .update({ open_first_at: new Date().toISOString(), open_count: ((openCount ?? 0) + 1) })
            .eq("id", id);
        } else {
          await supabaseAdmin
            .from("outbound_messages")
            .update({ open_count: ((openCount ?? 0) + 1) })
            .eq("id", id);
        }
      }
    } catch {}
  }
  return new NextResponse(GIF_1PX, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "pragma": "no-cache",
      "expires": "0",
    },
  });
}

