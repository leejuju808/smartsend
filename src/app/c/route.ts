import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function safeUrl(u: string) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    return x.toString();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const u = url.searchParams.get("u");
  const dest = u ? safeUrl(u) : null;
  if (!k || !dest) return NextResponse.redirect("https://example.com", 302);

  try {
    const { data } = await supabaseAdmin
      .from("outbound_messages")
      .select("id, click_count")
      .eq("tracking_key", k)
      .maybeSingle();

    if (data) {
      const id = (data as any).id as string;
      const clickCount = (data as any).click_count as number | null;
      await supabaseAdmin
        .from("outbound_messages")
        .update({ click_count: ((clickCount ?? 0) + 1) })
        .eq("id", id);
    }
  } catch {}

  return NextResponse.redirect(dest, 302);
}

