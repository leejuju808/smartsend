import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4, 1, 0, 0,
  0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 4, 1, 0, 59,
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const send_id = req.nextUrl.searchParams.get("s");
  const account_id = req.nextUrl.searchParams.get("a");

  if (send_id && account_id) {
    await supabase.from("email_events").insert({
      account_id,
      send_id,
      type: "open",
      user_agent: req.headers.get("user-agent") ?? undefined,
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0] || null,
    });
  }

  return new Response(GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}

