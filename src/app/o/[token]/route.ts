import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

const PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64"
);

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const token = (params.token || "").replace(/\.png$/i, "");
  if (!token) return new NextResponse(PX, { headers: imgHeaders() });

  const { data } = await supabaseAdmin
    .from("outbound_messages")
    .select("id, open_first_at, open_count")
    .eq("pixel_token", token)
    .maybeSingle();

  if (data) {
    if (!(data as any).open_first_at) {
      await supabaseAdmin
        .from("outbound_messages")
        .update({ open_first_at: new Date().toISOString(), open_count: ((data as any).open_count ?? 0) + 1 })
        .eq("id", (data as any).id);
    } else {
      await supabaseAdmin
        .from("outbound_messages")
        .update({ open_count: ((data as any).open_count ?? 0) + 1 })
        .eq("id", (data as any).id);
    }
  }

  return new NextResponse(PX, { headers: imgHeaders() });
}

function imgHeaders() {
  return {
    "content-type": "image/png",
    "cache-control": "no-store, private, max-age=0",
    "surrogate-control": "no-store",
  } as Record<string, string>;
}

